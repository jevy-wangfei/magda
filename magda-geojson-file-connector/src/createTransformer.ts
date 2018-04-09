import AspectBuilder from '@magda/typescript-common/dist/AspectBuilder';
import GeoJSONTransformer from './GeoJSONTransformer';
import * as moment from 'moment';
import * as URI from 'urijs';

export interface CreateTransformerOptions {
    name: string,
    id: string,
    sourceUrl: string,
    datasetAspectBuilders: AspectBuilder[],
    distributionAspectBuilders: AspectBuilder[],
    organizationAspectBuilders: AspectBuilder[]
}

export default function createTransformer({
    name,
    id,
    sourceUrl,
    datasetAspectBuilders,
    distributionAspectBuilders,
    organizationAspectBuilders
}: CreateTransformerOptions) {
    return new GeoJSONTransformer({
        sourceId: id,
        datasetAspectBuilders: datasetAspectBuilders,
        distributionAspectBuilders: distributionAspectBuilders,
        organizationAspectBuilders: organizationAspectBuilders,
        libraries: {
            gj: {
                  name: name,
                  sourceUrl: sourceUrl
            },
            moment: moment,
            URI: URI,
        }
    });
}
