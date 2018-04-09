import AsyncPage from "@magda/typescript-common/dist/AsyncPage";
//import formatServiceError from '@magda/typescript-common/dist/formatServiceError';
import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
//import retry from '@magda/typescript-common/dist/retry';
import {
    FeatureCollection,
    Feature,
    GeometryObject,
    GeoJsonObject,
    GeoJsonProperties
} from "geojson";
import * as request from "request";
import * as fs from "fs";

export interface GeoJSONFileReadResponse {
    result: GeoJSONFileReadResult;
    [propName: string]: any;
}

export interface GeoJSONFileReadResult {
    rootObject: GeoJsonObject;
    [propName: string]: any;
}

export interface GeoJSONOptions {
    sourceUrl: string;
    id: string;
    name: string;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    ignoreHarvestSources?: string[];
}

export default class GeoJSON implements ConnectorSource {
    public readonly sourceUrl: string;
    public readonly id: string;
    public readonly name: string;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    private ignoreHarvestSources: string[];
    private cachedGeoJSONObj: GeoJsonObject;

    constructor({
        sourceUrl,
        id,
        name,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        ignoreHarvestSources = []
    }: GeoJSONOptions) {
        this.sourceUrl = sourceUrl;
        this.id = id;
        this.name = name;
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;
        this.ignoreHarvestSources = ignoreHarvestSources;
        this.cachedGeoJSONObj = null;
    }

    // public packageSearch(options?: {
    //     ignoreHarvestSources?: string[];
    //     title?: string;
    //     sort?: string;
    //     start?: number;
    //     maxResults?: number;
    // }): AsyncPage<CkanPackageSearchResponse> {
    //     const url = new URI(this.urlBuilder.getPackageSearchUrl());
    //
    //     const solrQueries = [];
    //
    //     if (options && options.ignoreHarvestSources && options.ignoreHarvestSources.length > 0) {
    //         solrQueries.push(...options.ignoreHarvestSources.map(title => {
    //             const encoded = title === '*' ? title : encodeURIComponent('"' + title + '"');
    //             return `-harvest_source_title:${encoded}`
    //         }));
    //     }
    //
    //     if (options && options.title && options.title.length > 0) {
    //         const encoded = encodeURIComponent('"' + options.title + '"');
    //         solrQueries.push(`title:${encoded}`);
    //     }
    //
    //     let fqComponent = '';
    //
    //     if (solrQueries.length > 0) {
    //         fqComponent = '&fq=' + solrQueries.join('+');
    //     }
    //
    //     if (options && options.sort) {
    //         url.addSearch('sort', options.sort);
    //     }
    //
    //     const startStart = options.start || 0;
    //     let startIndex = startStart;
    //
    //     return AsyncPage.create<CkanPackageSearchResponse>(previous => {
    //         if (previous) {
    //             startIndex += previous.result.results.length;
    //             if (startIndex >= previous.result.count || (options.maxResults && (startIndex - startStart) >= options.maxResults)) {
    //                 return undefined;
    //             }
    //         }
    //
    //         const remaining = options.maxResults ? (options.maxResults - (startIndex - startStart)) : undefined;
    //         return this.requestPackageSearchPage(url, fqComponent, startIndex, remaining);
    //     });
    // }
    //
    // public organizationList(): AsyncPage<CkanOrganizationListResponse> {
    //     const url = new URI(this.urlBuilder.getOrganizationListUrl())
    //         .addSearch('all_fields', 'true')
    //         .addSearch('include_users', 'true')
    //         .addSearch('include_groups', 'true')
    //         .addSearch('include_extras', 'true')
    //         .addSearch('include_tags', 'true');
    //
    //     let startIndex = 0;
    //     return AsyncPage.create<CkanOrganizationListResponse>(previous => {
    //         if (previous) {
    //             if (previous.result.length === 0) {
    //                 return undefined;
    //             }
    //             startIndex += previous.result.length;
    //         }
    //
    //         return this.requestOrganizationListPage(url, startIndex, previous);
    //     });
    // }

    public GeoJSONFileRead(): Promise<GeoJSONFileReadResponse> {
        const sourceUrl = this.sourceUrl;
        const cachedGeoJSONObj: GeoJsonObject = this.cachedGeoJSONObj;
        return new Promise<GeoJSONFileReadResult>((resolve, reject) => {
            if (this.cachedGeoJSONObj) {
                return resolve({ rootObject: cachedGeoJSONObj });
            }
            if (sourceUrl.startsWith("file://")) {
                let filePath = sourceUrl.substring(7);
                let host;
                if (filePath.startsWith("/")) {
                    host = "localhost";
                } else {
                    const firstSplit = sourceUrl.split("/", 1);
                    if (firstSplit.length < 2) {
                        return reject(
                            "file:// path must start with a hostname, or file:/// for localhost."
                        );
                    } else {
                        host = firstSplit[0];
                        filePath = firstSplit[1];
                    }
                }
                if (!(host === "localhost" || host === "127.0.0.1")) {
                    return reject(
                        "file:// location URI only works on localhost for now."
                    );
                }
                let buffer = fs.readFileSync(filePath, {
                    encoding: "utf-8",
                    flag: "r"
                });
                let contents: GeoJsonObject = JSON.parse(buffer);

                return resolve({ rootObject: contents });
            } else {
                return request(
                    sourceUrl,
                    { json: true },
                    (error, response, body) => {
                        if (error) {
                            return reject(error);
                        }
                        return resolve({ rootObject: body.result });
                    }
                );
            }
        }).then(result => {
            return { result: result };
        });
    }

    public GeoJSONFilePage(): AsyncPage<GeoJSONFileReadResponse> {
        return AsyncPage.singlePromise<GeoJSONFileReadResponse>(
            this.GeoJSONFileRead()
        );
    }

    public getJsonDatasets(): AsyncPage<any[]> {
        // This pulls out the GeoJSON Features if it is a FeatureCollection.
        // Or returns the object itself it the object is a Feature.
        const filePages = this.GeoJSONFilePage();

        return filePages.map(filePage => {
            const fileReadResult = filePage.result;
            const fileRootObject = fileReadResult.rootObject;
            if (!("type" in fileRootObject)) {
                throw "GeoJSON object does not have a 'type";
            }
            const rootGeoJSONObj: GeoJsonObject = fileRootObject;
            if (rootGeoJSONObj.type === "FeatureCollection") {
                const featureCollection = <FeatureCollection<
                    GeometryObject,
                    GeoJsonProperties
                >>rootGeoJSONObj;
                return featureCollection.features;
            } else if (rootGeoJSONObj.type === "Feature") {
                const feature = <Feature<
                    GeometryObject,
                    GeoJsonProperties
                >>rootGeoJSONObj;
                return [feature];
            } else {
                console.log(
                    "GeoJSON top level object must be a Feature or FeatureCollection."
                );
                return [];
            }
        });
    }

    public getJsonDataset(id: string): Promise<any> {
        const url = this.sourceUrl;

        return new Promise<any>((resolve, reject) => {
            request(url, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body.result);
            });
        });
    }

    public searchDatasetsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        const filePages = this.GeoJSONFilePage();
        return filePages.map(filePage => [filePage.result.rootObject]);
    }

    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(dataset.resources || []);
    }

    public readonly hasFirstClassOrganizations = false;

    // public getJsonFirstClassOrganizations(): AsyncPage<object[]> {
    //     const organizationPages = this.organizationList();
    //     return organizationPages.map((organizationPage) => organizationPage.result);
    // }
    public getJsonFirstClassOrganizations(): AsyncPage<object[]> {
        return null;
    }

    // public getJsonFirstClassOrganization(id: string): Promise<object> {
    //     const url = this.urlBuilder.getOrganizationShowUrl(id);
    //
    //     return new Promise<any>((resolve, reject) => {
    //         request(url, { json: true }, (error, response, body) => {
    //             if (error) {
    //                 reject(error);
    //                 return;
    //             }
    //             resolve(body.result);
    //         });
    //     });
    // }
    public getJsonFirstClassOrganization(id: string): Promise<object> {
        return null;
    }

    // public searchFirstClassOrganizationsByTitle(title: string, maxResults: number): AsyncPage<any[]> {
    //     // CKAN doesn't have an equivalent of package_search for organizations, so we'll use
    //     // organization_autocomplete plus separate requests to look up the complete organization details.
    //     const url = new URI(this.urlBuilder.getOrganizationAutocompleteUrl(title)).addSearch('limit', maxResults).toString();
    //
    //     const promise = new Promise<any>((resolve, reject) => {
    //         request(url, { json: true }, (error, response, body) => {
    //             if (error) {
    //                 reject(error);
    //                 return;
    //             }
    //             resolve(body.result);
    //         });
    //     });
    //
    //     // CKAN (at least v2.5.2 currently on data.gov.au) doesn't honor the `limit` parameter.  So trim the results here.
    //     const trimmedResults = AsyncPage.singlePromise<any[]>(promise).map(organizations => organizations.slice(0, maxResults));
    //
    //     const result: any[] = [];
    //     return AsyncPage.singlePromise<any[]>(forEachAsync(trimmedResults, 6, (organization: any) => {
    //         return this.getJsonFirstClassOrganization(organization.id).then(organizationDetails => {
    //             result.push(organizationDetails);
    //         });
    //     }).then(() => result));
    // }
    public searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return null;
    }

    public getJsonDatasetPublisherId(dataset: any): string {
        if (!dataset.organization) {
            return undefined;
        }
        return dataset.organization.id;
    }

    public getJsonDatasetPublisher(dataset: any): Promise<any> {
        if (!dataset.organization) {
            return undefined;
        }
        return this.getJsonFirstClassOrganization(dataset.organization.id);
    }

    // private requestPackageSearchPage(url: uri.URI, fqComponent: string, startIndex: number, maxResults: number): Promise<CkanPackageSearchResponse> {
    //     const pageSize = maxResults && maxResults < this.pageSize ? maxResults : this.pageSize;
    //
    //     const pageUrl = url.clone();
    //     pageUrl.addSearch('start', startIndex);
    //     pageUrl.addSearch('rows', pageSize);
    //
    //     const operation = () => new Promise<CkanPackageSearchResponse>((resolve, reject) => {
    //         const requestUrl = pageUrl.toString() + fqComponent;
    //         console.log('Requesting ' + requestUrl);
    //         request(requestUrl, { json: true }, (error, response, body) => {
    //             if (error) {
    //                 reject(error);
    //                 return;
    //             }
    //             console.log('Received@' + startIndex);
    //             resolve(body);
    //         });
    //     });
    //
    //     return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));
    // }
    //
    // private requestOrganizationListPage(
    //     url: uri.URI,
    //     startIndex: number,
    //     previous: CkanOrganizationListResponse): Promise<CkanOrganizationListResponse> {
    //
    //     const pageUrl = url.clone();
    //     pageUrl.addSearch('offset', startIndex);
    //     pageUrl.addSearch('limit', this.pageSize);
    //
    //     const operation = () => new Promise<CkanOrganizationListResponse>((resolve, reject) => {
    //         console.log('Requesting ' + pageUrl.toString());
    //         request(pageUrl.toString(), { json: true }, (error, response, body) => {
    //             if (error) {
    //                 reject(error);
    //                 return;
    //             }
    //             console.log('Received@' + startIndex);
    //
    //             // Older versions of CKAN ignore the offset and limit parameters and just return all orgs.
    //             // To avoid paging forever in that scenario, we check if this page is identical to the last one
    //             // and ignore the items if so.
    //             if (previous && body &&
    //                 previous.result && body.result &&
    //                 previous.result.length === body.result.length &&
    //                 JSON.stringify(previous.result) === JSON.stringify(body.result)) {
    //
    //                 body.result.length = 0;
    //             }
    //
    //             resolve(body);
    //         });
    //     });
    //
    //     return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${pageUrl.toString()}.`, e, retriesLeft)));
    // }
}
