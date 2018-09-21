import JsonTransformer, {
    JsonTransformerOptions
} from "@magda/typescript-common/dist/JsonTransformer";
import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";
import { findClosestField, findClosestFieldThreshold } from "./fuzzyMatch";
const crypto = require("crypto");

export default class CsvTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        const id = findClosestField(jsonDataset, "id");
        return id !== undefined
            ? new ConnectorRecordId(id, "Dataset", sourceId)
            : undefined;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return findClosestField(jsonDataset, "title");
    }

    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        // our row is our distribution
        const id = findClosestField(jsonDistribution, "id");
        return id !== undefined
            ? new ConnectorRecordId(id, "Distribution", sourceId)
            : undefined;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return this.getNameFromJsonDataset(jsonDistribution);
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        // okay...we dont have ids in the input data - make some from hash
        const organisationName = this.getNameFromJsonOrganization(
            jsonOrganization
        );
        return organisationName !== undefined
            ? new ConnectorRecordId(
                  md5hash((organisationName + "").toLowerCase()),
                  "Organization",
                  sourceId
              )
            : undefined;
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        const title = findClosestFieldThreshold(
            jsonOrganization,
            0.8,
            "data custodian",
            "custodian"
        );
        const source = findClosestFieldThreshold(
            jsonOrganization,
            0.8,
            "primary source"
        );
        return title || source || "Unspecified";
    }
}

function md5hash(input: string): string {
    return crypto
        .createHash("md5")
        .update(input)
        .digest("hex");
}