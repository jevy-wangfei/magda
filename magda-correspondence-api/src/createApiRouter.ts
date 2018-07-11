import * as express from "express";
import * as emailValidator from "email-validator";
import * as _ from "lodash";

import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";

import { Router } from "express";
import { sendMail } from "./mail";
import { SMTPMailer } from "./SMTPMailer";
import { DatasetMessage } from "./model";
import renderTemplate, { Templates } from "./renderTemplate";
export interface ApiRouterOptions {
    registry: RegistryClient;
    defaultRecipient: string;
    smtpMailer: SMTPMailer;
    externalUrl: string;
}

function validateMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    const body: DatasetMessage = req.body;

    if (!body.message || !body.senderEmail || !body.senderName) {
        res.status(400).json({
            status: "Failure",
            error: "Missing input"
        });
    } else if (!emailValidator.validate(body.senderEmail)) {
        res.status(400).json({
            status: "Failure",
            error: "Invalid email: " + body.senderEmail
        });
    } else {
        next();
    }
}

export default function createApiRouter(
    options: ApiRouterOptions
): express.Router {
    const router: Router = express.Router();

    router.get("/healthz", (req, res) =>
        options.smtpMailer
            .checkConnectivity()
            .then(() => {
                res.status(200).json({
                    status: "OK"
                });
            })
            .catch(e => {
                res.status(500).json({
                    status: "Failure"
                });
            })
    );

    router.post("/public/send/dataset/request", validateMiddleware, function(
        req,
        res
    ) {
        const body: DatasetMessage = req.body;
        const subject = `Data Request from ${body.senderName}`;
        const html = renderTemplate(
            Templates.Request,
            body,
            subject,
            options.externalUrl
        );

        handlePromise(
            sendMail(
                options.smtpMailer,
                options.defaultRecipient,
                body,
                html,
                subject
            ),
            res
        );
    });

    router.post(
        "/public/send/dataset/:datasetId/question",
        validateMiddleware,
        function(req, res) {
            const body: DatasetMessage = req.body;

            const promise = getDataset(req.params.datasetId).then(dataset => {
                const subject = `Question About ${
                    dataset.aspects["dcat-dataset-strings"].title
                }`;

                const html = renderTemplate(
                    Templates.Question,
                    body,
                    subject,
                    options.externalUrl,
                    dataset
                );

                return sendMail(
                    options.smtpMailer,
                    options.defaultRecipient,
                    body,
                    html,
                    subject,
                    // TODO: Send to the dataset's contactPoint
                    options.defaultRecipient
                );
            });

            handlePromise(promise, res, req.params.datasetId);
        }
    );

    router.post(
        "/public/send/dataset/:datasetId/report",
        validateMiddleware,
        function(req, res) {
            const body: DatasetMessage = req.body;

            const promise = getDataset(req.params.datasetId).then(dataset => {
                const subject = `Feedback Regarding ${
                    dataset.aspects["dcat-dataset-strings"].title
                }`;

                const html = renderTemplate(
                    Templates.Feedback,
                    body,
                    subject,
                    options.externalUrl,
                    dataset
                );

                return sendMail(
                    options.smtpMailer,
                    options.defaultRecipient,
                    body,
                    html,
                    subject,
                    options.defaultRecipient
                );
            });

            handlePromise(promise, res, req.params.datasetId);
        }
    );

    /**
     * Gets a dataset from the registry as a promise, unwrapping it from its
     * aspect.
     */
    function getDataset(datasetId: string): Promise<Record> {
        return options.registry
            .getRecord(
                encodeURIComponent(datasetId),
                ["dcat-dataset-strings"],
                [],
                false
            )
            .then(result => unionToThrowable(result));
    }

    return router;
}

/**
 * Translates a promise into a response, returning 200 if the promise resolves,
 * 404 if it rejects with `response.statusCode: 404` in the error (as per the
 * registry api) or 500 if it rejects for another reason.
 */
function handlePromise(
    promise: Promise<any>,
    response: express.Response,
    datasetId?: string
): void {
    promise
        .then(() => response.status(200).json({ status: "OK" }))
        .catch(e => {
            if (_.get(e, "e.response.statusCode") === 404) {
                console.error(
                    "Attempted to send correspondence for non-existent dataset " +
                        datasetId
                );
                response.status(404).json({
                    status: "Failure",
                    error: "Dataset " + datasetId + " not found"
                });
            } else {
                throw e;
            }
        })
        .catch(e => {
            console.error(e);
            response.status(500).json({ status: "Failure" });
        });
}
