// Read Guazi's flat Markdown fields and the observed YAML block scalars without
// executing YAML tags. Unknown fields remain in the original field dictionary.
export function chinaFields(markdown) {
  const fields = Object.create(null), lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_]+):\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^[>|][-+]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i+1]) || lines[i+1] === '')) block.push(lines[++i]);
      const indent = Math.min(...block.filter(s=>s.trim()).map(s=>s.match(/^ */)[0].length));
      const content = block.map(s => s.slice(indent));
      value = value.startsWith('|') ? content.join('\n').trimEnd() : content.join('\n').replace(/([^\n])\n(?=[^\n])/g,'$1 ').trim();
    } else value = value.replace(/^['"]|['"]$/g, '');
    fields[m[1]] = value;
  }
  return fields;
}

export function chinaCondition(fields) {
  const condition = fields.condition_desc || '';
  const claims = condition.match(/(?:理赔|出险)\s*(\d+)\s*次/);
  const score = (fields.appearance_score || '').match(/^(\d+(?:\.\d+)?)分/);
  const transfers = (fields.transfer_times || '').match(/^(\d+)次/);
  const highlights = fields.highlights || '';
  // Preserve the whole original and condition-related excerpts. Free prose is
  // never declared translated just because a few body-part words were matched.
  const excerpts = highlights.split(/(?<=[。！？])/u).map(s=>s.trim()).filter(s=>/钣金|喷漆|补漆|修复|变形|更换|划痕|剐蹭|受损|损伤|事故|泡水|火烧|骨架|结构件/.test(s));
  return {
    sourceLocale: 'zh-CN', sourceKind: 'listing_description',
    description: fields.description || null, highlights: highlights || null,
    conditionDescription: condition || null, appearanceDescription: fields.appearance_desc || null,
    appearanceScore: score && Number(score[1]) <= 100 ? Number(score[1]) : null,
    insuranceClaimCount: claims ? Number(claims[1]) : null,
    transferCount: transfers ? Number(transfers[1]) : null,
    repairExcerpts: excerpts,
    summaryRu: [score ? `Оценка внешнего вида источника: ${score[1]}/100.` : '', claims ? `Страховых обращений по описанию: ${claims[1]}.` : '', transfers ? `Переоформлений: ${transfers[1]}.` : ''].filter(Boolean).join(' ') || null,
    translation: { status: excerpts.length ? 'repair_text_pending' : 'structured_only', locale: 'ru', method: 'structured_fields', originalPreserved: true },
  };
}
