import * as fs from "fs";

export default [
    {
        aspectDefinition: {
            id: "project-open-data-distribution",
            name: "Project Open Data (data.json) Distribution",
            jsonSchema: require("@magda/registry-aspects/project-open-data-distribution.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/project-open-data-distribution.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "dcat-distribution-strings",
            name: "DCAT Distribution properties as strings",
            jsonSchema: require("@magda/registry-aspects/dcat-distribution-strings.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/dcat-distribution-strings.js",
            "utf8"
        )
    },
    {
        aspectDefinition: {
            id: "source",
            name: "Source",
            jsonSchema: require("@magda/registry-aspects/source.schema.json")
        },
        builderFunctionString: fs.readFileSync(
            "aspect-templates/distribution-source.js",
            "utf8"
        )
    }
];
