import { imageUrl, sourceUrl } from './guazi-pilot-data.mjs';

// Validate against the lite report captured on this exact product page. The API
// does not echo productId, so taskId and masked VIN are both required anchors.
export function normalizeGuaziReport(capture, card) {
  const payload = capture.payload, data = payload?.data;
  if (payload?.code !== 0 || payload?.success !== true || !data?.baseInfo || !Array.isArray(data.categoryList) || !data.categoryList.length) throw new Error('Not a successful full inspection report');
  const expected = card.inspection.lite?.baseInfo;
  const request = new URL(sourceUrl(capture.sourceUrl, 'report'));
  if (request.searchParams.get('productId') !== card.productId || expected?.taskId == null || data.baseInfo.taskId !== expected.taskId || data.taskId !== expected.taskId || !expected.vinMask || data.baseInfo.vinMask !== expected.vinMask) throw new Error('Full inspection identity mismatch');
  // Older inspections use taskId=0. The exact product request, VIN, source
  // vehicle photo and title provide independent anchors in that observed case.
  if (expected.taskId === 0 && (!expected.vehicleMainImage || expected.vehicleMainImage !== data.baseInfo.vehicleMainImage || !expected.title || expected.title !== data.baseInfo.title)) throw new Error('Full inspection identity mismatch');
  const photos = new Map();
  const groups = data.categoryList.map(category => {
    if (!Array.isArray(category.itemList) || !category.itemList.length) throw new Error('Inspection category missing items');
    const items = category.itemList.map(item => {
      if (!item.itemId || !item.itemName || !Array.isArray(item.imageDetailList)) throw new Error('Inspection item schema changed');
      const evidence = item.imageDetailList.map(image => {
        if (!Array.isArray(image.positionList)) throw new Error('Inspection result schema changed');
        const positions = image.positionList.map(p => ({ resultIds: p.resultIds, resultNames: p.resultNames, normal: p.normal, x: p.x, y: p.y }));
        const url = image.url ? imageUrl(image.url) : null;
        if (url) {
          const photo = photos.get(url) || { sourceUrl: url, position: photos.size + 1, groups: [], evidence: [], hasSourceAbnormality: false };
          if (!photo.groups.includes(category.categoryName)) photo.groups.push(category.categoryName);
          photo.evidence.push({ categoryId: category.categoryId, itemId: item.itemId, itemName: item.itemName, positions });
          photo.hasSourceAbnormality ||= positions.some(p => p.normal === 0);
          photos.set(url, photo);
        }
        return { sourceUrl: url, positions };
      });
      const results = evidence.flatMap(e => e.positions);
      return { id: item.itemId, name: item.itemName,
        status: results.some(p=>p.normal === 0) ? 'source_abnormal' : results.length && results.every(p=>p.normal === 1) ? 'source_normal' : 'unknown', evidence };
    });
    return { id: category.categoryId, name: category.categoryName, items };
  });
  const expectedGroups = card.inspection.lite?.categoryList;
  if (Array.isArray(expectedGroups) && expectedGroups.length) {
    if (groups.length !== expectedGroups.length || new Set(groups.map(g=>g.id)).size !== groups.length || expectedGroups.some(g => {
      const actual = groups.find(group=>group.id===g.categoryId);
      return !actual || actual.items.length !== g.normalCount + g.abnormalCount;
    })) throw new Error('Full inspection item counts do not match the card');
  }
  return {
    schemaVersion: 1, status: 'validated', sourceUrl: capture.sourceUrl, observedAt: capture.observedAt,
    productId: card.productId, taskId: data.taskId, vinMask: data.baseInfo.vinMask, grade: data.baseInfo.level,
    validation: expected.taskId === 0 ? 'correlated_product_request_and_matching_vin_photo_title' : 'correlated_product_request_and_matching_task_id_and_masked_vin',
    // Preserve labels/flags; don't turn them into our own accident-free verdict.
    sourceRiskLabels: data.baseInfo.threeStateList ?? [], groups,
    itemCount: groups.reduce((s,g)=>s+g.items.length,0),
    abnormalItemCount: groups.flatMap(g=>g.items).filter(i=>i.status==='source_abnormal').length,
    images: [...photos.values()], videoList: data.videoList ?? [], conditionVideos: data.conditionVideos ?? [],
  };
}
