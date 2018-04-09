var gj = libraries.gj;

return {
    type: 'geojson-distribution',
    //url: ckan.getPackageShowUrl(dataset.id),
    url: gj.sourceUrl,
    id: gj.id,
    name: gj.name
};
