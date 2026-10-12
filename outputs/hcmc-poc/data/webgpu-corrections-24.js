// Curated corrections are kept outside the renderer so the source city dataset
// remains immutable. Every entry must also have provenance in ba-son-marina-24.json.
window.WEBGPU_CORRECTIONS_24=Object.freeze({
  version:'31a',
  marinaCentral:Object.freeze({
    parts:Object.freeze({
      1432358258:Object.freeze({name:'Marina Central Tower'}),
      1432358259:Object.freeze({name:'Marina Central Tower · khối đế'}),
      1432358260:Object.freeze({name:'Marina Central Tower · đỉnh 240 m'})
    }),
    heightM:240,
    floors:55,
    center:Object.freeze([-400.2,-352.4]),
    rotation:Math.atan2(36.16,38.37)
  }),
  grandMarina:Object.freeze({
    parts:Object.freeze({
      1151026864:Object.freeze({h:170,levels:47}),
      1151026865:Object.freeze({h:170,levels:47}),
      1151026866:Object.freeze({h:170,levels:47}),
      1151026867:Object.freeze({h:162,levels:45})
    }),
    shared:Object.freeze({
      name:'Grand Marina Residences · tháp cao tầng',
      type:'apartments',
      glass:true,
      q:'official_floor_count_proxy'
    })
  })
});
