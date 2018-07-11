import * as express from "express";
import * as yargs from "yargs";

import RegistryClient from "@magda/typescript-common/dist/registry/RegistryClient";

import createApiRouter from "./createApiRouter";
import { NodeMailerSMTPMailer } from "./SMTPMailer";

const argv = yargs
    .config()
    .help()
    .option("listenPort", {
        describe:
            "The TCP/IP port on which the authorization-api should listen.",
        type: "number",
        default: 6117
    })
    .option("registryUrl", {
        describe: "The base url for the registry",
        type: "string",
        default:
            process.env.REGISTRY_URL ||
            process.env.npm_package_config_registryUrl ||
            "http://localhost:6117/api/v0/registry"
    })
    .option("externalUrl", {
        describe:
            "The base external URL for constructing hyperlinks back to the portal in emails - e.g. 'https://search.data.gov.au'. Don't leave a trailing /",
        type: "string",
        default:
            process.env.npm_package_config_externalUrl ||
            "https://search.data.gov.au"
    })
    .option("smtpHostname", {
        describe: "The SMTP server hostname",
        type: "string",
        default: ""
    })
    .option("smtpPort", {
        describe: "The SMTP server port",
        type: "number",
        default: 587
    })
    .option("smtpSecure", {
        describe: "If the SMTP server should use SSL/TLS",
        type: "boolean",
        default: true
    })
    .option("smtpUsername", {
        describe:
            "The username to authenticate with the SMTP server. Also passable as an env var via SMTP_USERNAME",
        type: "string"
    })
    .option("smtpPassword", {
        describe:
            "The password to authenticate with the SMTP server. Also passable as an env var via SMTP_PASSWORD",
        type: "string"
    })
    .option("defaultRecipient", {
        describe:
            "The email address to send data requests and questions/feedback on datasets where the email address couldn't be resolved",
        type: "string",
        demandOption: true
    }).argv;

const app = express();
app.use(require("body-parser").json());
app.use(
    "/v0",
    createApiRouter({
        registry: new RegistryClient({ baseUrl: argv.registryUrl }),
        defaultRecipient: argv.defaultRecipient,
        externalUrl: argv.externalUrl,
        smtpMailer: new NodeMailerSMTPMailer({
            smtpHostname: argv.smtpHostname,
            smtpPort: argv.smtpPort,
            smtpSecure: argv.smtpSecure,
            smtpUsername: argv.smtpUsername || process.env.SMTP_USERNAME,
            smtpPassword: argv.smtpPassword || process.env.SMTP_PASSWORD
        })
    })
);

const listenPort = argv.listenPort;
app.listen(listenPort);
console.log("Listening on " + listenPort);

process.on("unhandledRejection", (reason: string, promise: any) => {
    console.error(reason);
});
