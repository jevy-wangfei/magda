package au.csiro.data61.magda.registry

import akka.actor.{ Actor, ActorLogging, ActorRef, ActorSystem, Props }
import au.csiro.data61.magda.model.Registry._
import akka.pattern.pipe
import scalikejdbc.DB
import scala.concurrent.Future
import scala.concurrent.Await
import scala.concurrent.duration._
import au.csiro.data61.magda.util.ErrorHandling
import akka.stream.OverflowStrategy
import akka.stream.scaladsl.Source
import akka.stream.scaladsl.SourceQueue
import akka.stream.scaladsl.Sink
import akka.stream.ActorMaterializer
import akka.stream.scaladsl.SourceQueueWithComplete
import akka.stream.DelayOverflowStrategy
import akka.stream.Attributes
import com.typesafe.config.Config
import akka.actor.ActorContext

object WebHookActor {
  case class Process(ignoreWaitingForResponse: Boolean = false, aspectIds: Option[List[String]] = None, webHookId: Option[String] = None)
  case class GetStatus(webHookId: String)
  case object InvalidateWebhookCache

  case class Status(isProcessing: Option[Boolean])

  def props(registryApiBaseUrl: String)(implicit config: Config) = Props(new AllWebHooksActor(registryApiBaseUrl))

  private def createWebHookActor(context: ActorContext, registryApiBaseUrl: String, hook: WebHook)(implicit config: Config): ActorRef = {
    context.actorOf(Props(new SingleWebHookActor(hook.id.get, registryApiBaseUrl)), name = "WebHookActor-" + java.net.URLEncoder.encode(hook.id.get, "UTF-8") + "-" + java.util.UUID.randomUUID.toString)
  }

  private case class GotAllWebHooks(webHooks: List[WebHook], startup: Boolean)
  private case class DoneProcessing(result: Option[WebHookProcessingResult], exception: Option[Throwable] = None)

  private class AllWebHooksActor(val registryApiBaseUrl: String)(implicit val config: Config) extends Actor with ActorLogging {
    import context.dispatcher

    private var webHookActors = Map[String, ActorRef]()
    //    private var cachedWebhooks: Option[List[WebHook]] = None
    private implicit val scheduler = this.context.system.scheduler

    def setup =
      Await.result(ErrorHandling.retry(() => Future { queryForAllWebHooks() }, 30 seconds, 10, (retryCount, e) => log.error(e, "Failed to get webhooks, {} retries left until I crash", retryCount))
        .recover {
          case (e: Throwable) =>
            log.error(e, "Failed to get webhooks for processing")
            // This is a massive deal. Let it crash and let kubernetes deal with it.
            System.exit(1)
            throw e
        }
        .map { webHooks =>
          // Create a child actor for each WebHook that doesn't already have one.
          // Send a `Process` message to all existing and new WebHook actors.
          val currentHooks = webHooks.filter(_.active).map(_.id.get).toSet
          val existingHooks = webHookActors.keySet

          // Shut down actors for WebHooks that no longer exist
          val obsoleteHooks = existingHooks.diff(currentHooks)
          obsoleteHooks.foreach { id =>
            log.info("Removing old web hook actor for {}.", id)
            this.webHookActors.get(id).get ! "kill"
            this.webHookActors -= id
          } // Create actors for new WebHooks and post to all actors (new and old).
          webHooks.filter(_.active).foreach { hook =>
            val id = hook.id.get
            val actorRef = this.webHookActors.get(id) match {
              case Some(actorRef) => actorRef
              case None => {
                log.info("Creating new web hook actor for {}.", id)
                val actorRef = WebHookActor.createWebHookActor(context, registryApiBaseUrl, hook)
                this.webHookActors += (id -> actorRef)
                actorRef
              }
            }
          }
        }, 10 minutes)

    setup

    def receive = {
      case InvalidateWebhookCache => 
        log.info("Invalidated webhook cache")
        setup
      case Process(ignoreWaitingForResponse, aspectIds, webHookId) => {
        val actors = webHookId match {
          case None                 => webHookActors.values
          case Some(webHookIdInner) => webHookActors.get(webHookIdInner).toList
        }

        actors.foreach(actorRef =>
          actorRef ! Process(ignoreWaitingForResponse, aspectIds))
      }
      case GetStatus(webHookId) =>
        webHookActors.get(webHookId) match {
          case None               => sender() ! WebHookActor.Status(None)
          case Some(webHookActor) => webHookActor forward WebHookActor.GetStatus
        }
    }

    private def queryForAllWebHooks(): List[WebHook] = {
      DB readOnly { implicit session =>
        HookPersistence.getAll(session)
      }
    }
  }

  private class SingleWebHookActor(val id: String, val registryApiBaseUrl: String)(implicit val config: Config) extends Actor with ActorLogging {
    import context.dispatcher

    val MAX_EVENTS = 100

    private val processor = new WebHookProcessor(context.system, registryApiBaseUrl, context.dispatcher)
    implicit val materializer = ActorMaterializer()

    def getWebhook() =
      DB readOnly { implicit session =>
        HookPersistence.getById(session, id) match {
          case None          => throw new RuntimeException(s"No WebHook with ID ${id} was found.")
          case Some(webHook) => webHook
        }
      }

    private var count = 0

    private val indexQueue: SourceQueueWithComplete[Boolean] =
      Source.queue[Boolean](0, OverflowStrategy.dropNew)
        .map { x =>
          count += 1
          x
        }
        .delay(config.getInt("webhookActorTickRate") milliseconds, OverflowStrategy.backpressure).withAttributes(Attributes.inputBuffer(1, 1)) // Make sure we only execute once per webhookActorTickRate to prevent sending an individual post for every event.
        .mapAsync(1) {
          ignoreWaitingForResponse =>
            val webHook = getWebhook()

            if (!ignoreWaitingForResponse && webHook.isWaitingForResponse.getOrElse(false)) {
              log.info("Skipping WebHook {} as it's marked as waiting for response", webHook.id)
              Future.successful(false)
            } else {
              val aspects = webHook.config.aspects ++ webHook.config.optionalAspects

              val eventPage = DB readOnly { implicit session =>
                EventPersistence.getEvents(session, webHook.lastEvent, None, Some(MAX_EVENTS), None, None, (webHook.config.aspects ++ webHook.config.optionalAspects).flatten.toSet, webHook.eventTypes)
              }

              val previousLastEvent = webHook.lastEvent
              val lastEvent = eventPage.events.lastOption.flatMap(_.id)

              if (lastEvent.isEmpty) {
                log.info("WebHook {}: Up to date at event {}", this.id, previousLastEvent)
                Future.successful(false)
              } else {
                log.info("WebHook {} Processing {}-{}: STARTING", this.id, previousLastEvent, lastEvent)

                processor.sendSomeNotificationsForOneWebHook(this.id, webHook, eventPage).map {
                  case WebHookProcessor.Deferred =>
                    // response deferred
                    log.info("WebHook {} Processing {}-{}: DEFERRED BY RECEIVER", this.id, previousLastEvent, lastEvent)
                  case WebHookProcessor.NotDeferred =>
                    // POST succeeded, is there more to do?
                    log.info("WebHook {} Processing {}-{}: DELIVERED", this.id, previousLastEvent, lastEvent)

                    if (previousLastEvent != lastEvent) {
                      self ! Process()
                    }
                  case WebHookProcessor.HttpError(status) =>
                    // encountered an error while communicating with the hook recipient - deactivate the hook until its manually fixed
                    log.info("WebHook {} Processing {}-{}: HTTP FAILURE {}, DEACTIVATING", this.id, previousLastEvent, lastEvent, status.reason())
                    context.parent ! InvalidateWebhookCache
                }.recover {
                  case e =>
                    // Error communicating with the hook recipient - log the failure and wait until the next Process() call to resume.
                    log.error(e, "WebHook {} Processing {}-{}: FAILED", this.id, previousLastEvent, lastEvent)
                }
              }
            }
        }
        .map { x =>
          count -= 1
          x
        }
        .to(Sink.ignore)
        .run()

    def receive = {
      case Process(ignoreWaitingForResponse, _, _) => {
        indexQueue.offer(ignoreWaitingForResponse)
      }
      case GetStatus =>
        sender() ! Status(Some(count != 0))
    }
  }
}
