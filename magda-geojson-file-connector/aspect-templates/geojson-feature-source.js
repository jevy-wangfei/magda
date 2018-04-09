var gj = libraries.gj;

return {
    type: 'geojson-feature',
    url: gj.sourceUrl,
    //url: gj.getSourceUrl(dataset.id),
    id: gj.id,
    name: gj.name
};
