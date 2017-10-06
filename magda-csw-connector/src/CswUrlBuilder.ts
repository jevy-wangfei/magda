import * as URI from 'urijs';

export interface CswUrlBuilderOptions {
    name?: string,
    baseUrl: string;
    apiBaseUrl?: string;
}

export default class CswUrlBuilder {
    public readonly name: string;
    public readonly baseUrl: uri.URI;

    public readonly GetRecordsParameters = {
        service: 'CSW',
        version: '2.0.2',
        request: 'GetRecords',
        constraintLanguage: 'FILTER',
        resultType: 'results',
        elementsetname: 'full',
        outputschema: 'http://www.isotc211.org/2005/gmd',
        typeNames: 'gmd:MD_Metadata'
    };

    public readonly GetRecordByIdParameters = {
        service: 'CSW',
        version: '2.0.2',
        request: 'GetRecordById',
        elementsetname: 'full',
        outputschema: 'http://www.isotc211.org/2005/gmd',
        typeNames: 'gmd:MD_Metadata'
    };

    constructor(options: CswUrlBuilderOptions) {
        this.name = options.name || 'CSW';
        this.baseUrl = new URI(options.baseUrl);
    }

    public getRecordsUrl(): string {
        return this.baseUrl.clone().addSearch(this.GetRecordsParameters).toString();
    }

    public getRecordByIdUrl(id: string): string {
        return this.baseUrl.clone().addSearch(this.GetRecordByIdParameters).addSearch('id', id).toString();
    }
}