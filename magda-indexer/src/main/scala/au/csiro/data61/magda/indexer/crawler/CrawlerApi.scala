package au.csiro.data61.magda.indexer.crawler

import au.csiro.data61.magda.indexer.search.SearchIndexer
import au.csiro.data61.magda.api.BaseMagdaApi
import au.csiro.data61.magda.model.Registry.WebHookPayload
import akka.event.LoggingAdapter
import akka.http.scaladsl.server.Directives._
import scala.util.Failure
import scala.util.Success
import akka.http.scaladsl.model.StatusCodes.{ Accepted, Conflict, OK }
import akka.actor.ActorSystem
import scala.concurrent.Future
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json._
import au.csiro.data61.magda.model.Registry.RegistryProtocols
import scala.concurrent.duration._
import au.csiro.data61.magda.AppConfig
import com.typesafe.config.Config

class CrawlerApi(crawler: Crawler, indexer: SearchIndexer)(implicit system: ActorSystem, config: Config) extends BaseMagdaApi with RegistryProtocols {
  implicit val ec = system.dispatcher
  override def getLogger = system.log

  val routes =
    magdaRoute {
      path("snapshot") {
        post {
          indexer.snapshot()
          complete(Accepted)
        }
      } ~
      path("in-progress") {
        get {
          complete(OK, crawler.crawlInProgress().toString)
        }
      } ~
        post {
          if (crawl) {
            complete(Accepted)
          } else {
            complete(Conflict, "Reindex in progress")
          }
        }
    }

  def crawl(): Boolean = {
    if (crawler.crawlInProgress()) {
      false
    } else {
      crawler.crawl().onComplete {
        case Success(_) =>
          getLogger.info("Successfully completed crawl")
        case Failure(e) =>
          getLogger.error(e, "Crawl failed")
      }

      true
    }
  }
}