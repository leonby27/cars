import { useEffect, useId, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BatteryHigh,
  Camera,
  CaretDown,
  CaretRight,
  CheckCircle,
  ClipboardText,
  Images,
  Info,
  MagnifyingGlass,
  ShieldCheck,
  X,
} from "./icons.jsx";

const asList = (value) => (Array.isArray(value) ? value : []);

const INSPECTION_STATUS_LABELS = Object.freeze({
  clear: "Без замечаний",
  attention: "Есть замечание",
  limited: "Осмотр ввиду конструкции авто ограничен",
  "not-applicable": "Не предусмотрено",
});

const isInspectionIssue = (point) => point.status === "attention" || point.status === "limited";
const PHOTO_EVIDENCE_SECTION_KEY = "photo-evidence";

function StatusIcon({ tone, size = 19 }) {
  if (tone === "attention" || tone === "critical") return <Info size={size} weight="fill" />;
  return <CheckCircle size={size} weight="fill" />;
}

function InspectionStatusIcon({ status, size = 18 }) {
  if (status === "attention") return <Info size={size} weight="fill" />;
  if (status === "limited") return <Info size={size} weight="fill" />;
  if (status === "not-applicable") return <span aria-hidden="true">—</span>;
  return <CheckCircle size={size} weight="fill" />;
}

function InspectionPointRow({ point, photoIndexById, onOpenPhotos }) {
  const status = INSPECTION_STATUS_LABELS[point.status] ? point.status : "clear";
  const linkedPhotoIds = [...new Set(asList(point.photoIds).filter((photoId) => photoIndexById.has(photoId)))];
  const linkedPhotoCount = linkedPhotoIds.length;
  const hasPhotos = linkedPhotoCount > 0;
  const rowContent = (
    <>
      <span className={`service-report-inspection-icon ${status}`} aria-hidden="true">
        <InspectionStatusIcon status={status} size={28} />
      </span>
      <span className="service-report-inspection-copy">
        <strong>{point.label}</strong>
        <span className={`service-report-inspection-status ${status}`}>{INSPECTION_STATUS_LABELS[status]}</span>
      </span>
      {hasPhotos && (
        <span className="service-report-inspection-photo-link" aria-hidden="true">
          <Images size={18} weight="fill" />
          <span>{linkedPhotoCount} фото</span>
          <CaretRight size={17} weight="bold" />
        </span>
      )}
    </>
  );

  return hasPhotos ? (
    <button
      className={`service-report-inspection-row ${status} has-photos`}
      type="button"
      onClick={() => onOpenPhotos(linkedPhotoIds, point.detail)}
      aria-label={`${point.label}. ${INSPECTION_STATUS_LABELS[status]}. Открыть ${linkedPhotoCount} фото`}
    >
      {rowContent}
    </button>
  ) : (
    <div className={`service-report-inspection-row ${status}`}>
      {rowContent}
    </div>
  );
}

function factValue(fact, photoCount) {
  if (fact.metric === "photoCount") return String(photoCount);
  return fact.value;
}

/**
 * Универсальное представление отчёта осмотра.
 * Вся информация о конкретной машине, формулировки и фотографии приходят через report.
 * Пустые необязательные разделы не отображаются, а счётчики вычисляются автоматически.
 */
export function InspectionReport({ report }) {
  const instanceId = useId().replace(/:/g, "");
  const sectionId = `inspection-report-${instanceId}`;
  const risks = asList(report?.risks);
  const facts = asList(report?.facts);
  const photoGroups = asList(report?.photoGroups);
  const inspectionSections = asList(report?.inspectionSections);
  const recommendationSteps = asList(report?.recommendation?.steps);
  const vehicleMeta = asList(report?.vehicle?.meta);
  const allPhotos = useMemo(
    () => photoGroups.flatMap((group, groupIndex) => {
      const groupKey = group.id || `group-${groupIndex}`;
      return asList(group.photos).map((photo, photoIndex) => ({
        ...photo,
        groupId: groupKey,
        key: `${groupKey}:${photo.id || `photo-${photoIndex}`}`,
      }));
    }),
    [photoGroups],
  );
  const vehicleDetails = [
    ...vehicleMeta,
    ...facts.map((fact) => ({ ...fact, value: factValue(fact, allPhotos.length) })),
  ];
  const vehicleDetailsColumnBreak = Math.ceil(vehicleDetails.length / 2);
  const allPhotoIndexes = useMemo(() => allPhotos.map((_, index) => index), [allPhotos]);
  const photoIndexById = useMemo(
    () => new Map(allPhotos.map((photo, index) => [photo.id, index]).filter(([photoId]) => photoId)),
    [allPhotos],
  );
  const [expandedInspectionSections, setExpandedInspectionSections] = useState({});
  const [viewer, setViewer] = useState(null);
  const viewerPhotoIndexes = asList(viewer?.photoIndexes);
  const activePhotoIndex = viewerPhotoIndexes[viewer?.position ?? -1];
  const activePhoto = Number.isInteger(activePhotoIndex) ? allPhotos[activePhotoIndex] : null;
  const isPhotoEvidenceExpanded = Boolean(expandedInspectionSections[PHOTO_EVIDENCE_SECTION_KEY]);
  const photoEvidenceId = `${sectionId}-${PHOTO_EVIDENCE_SECTION_KEY}`;

  const openPhotoSet = (photoIndexes, initialPosition = 0, description = "") => {
    const validIndexes = photoIndexes.filter((index) => Number.isInteger(index) && allPhotos[index]);
    if (validIndexes.length === 0) return;
    setViewer({ photoIndexes: validIndexes, position: Math.min(Math.max(initialPosition, 0), validIndexes.length - 1), description });
  };

  const openLinkedPhotos = (photoIds, description = "") => {
    openPhotoSet(asList(photoIds).map((photoId) => photoIndexById.get(photoId)), 0, description);
  };

  const moveViewer = (direction) => {
    setViewer((current) => {
      const indexes = asList(current?.photoIndexes);
      if (indexes.length < 2) return current;
      return { ...current, position: (current.position + direction + indexes.length) % indexes.length };
    });
  };

  useEffect(() => {
    setViewer(null);
    setExpandedInspectionSections({});
  }, [report?.id]);

  useEffect(() => {
    if (!viewer || viewerPhotoIndexes.length === 0) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape") setViewer(null);
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [viewer, viewerPhotoIndexes.length]);

  if (!report?.vehicle?.name || !report?.verdict) return null;

  return (
    <section className="service-report-example page-width" aria-labelledby={`${sectionId}-title`}>
      <div className="service-report-example-heading">
        {report.presentation?.eyebrow && <span>{report.presentation.eyebrow}</span>}
        <h2 id={`${sectionId}-title`}>{report.presentation?.title || "Пример отчёта о состоянии авто"}</h2>
        {report.presentation?.description && <p>{report.presentation.description}</p>}
      </div>

      <article className="service-report-vehicle">
          <div className="service-report-vehicle-top">
            <div className="service-report-vehicle-overview">
              <div className="service-report-vehicle-heading">
                {report.vehicle.image?.src && (
                  <img
                    className="service-report-vehicle-image"
                    src={report.vehicle.image.src}
                    width={report.vehicle.image.width || 960}
                    height={report.vehicle.image.height || 506}
                    alt={report.vehicle.image.alt || report.vehicle.name}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <h3>{report.vehicle.name}</h3>
              </div>
              {vehicleDetails.length > 0 && (
                <div className="service-report-vehicle-meta-grid">
                  {[vehicleDetails.slice(0, vehicleDetailsColumnBreak), vehicleDetails.slice(vehicleDetailsColumnBreak)].map((column, columnIndex) => (
                    <dl key={columnIndex}>
                      {column.map((item) => (
                        <div key={item.id || item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                      ))}
                    </dl>
                  ))}
                </div>
              )}
              {report.document?.badge && <span className="service-report-demo-badge">{report.document.badge}</span>}
            </div>

            <div className={`service-report-verdict ${report.verdict.tone || "confirmed"}${report.verdict.decision ? " has-decision" : ""}`}>
              <span className="service-report-verdict-icon" aria-hidden="true"><ShieldCheck size={36} weight="duotone" /></span>
              <div>
                <h3>{report.verdict.title}</h3>
                {report.verdict.summary && <p>{report.verdict.summary}</p>}
              </div>
              {report.verdict.decision && <strong><StatusIcon tone={report.verdict.tone} size={20} />{report.verdict.decision}</strong>}
            </div>
          </div>

          {(risks.length > 0 || allPhotos.length > 0) && (
            <section className="service-report-vehicle-risks" aria-label={report.labels?.risksTitle || "Ключевые риски"}>
              <div className="service-report-risk-grid">
                {risks.map((risk, riskIndex) => {
                  const inspectionSection = inspectionSections.find((section) => section.id === risk.id) || inspectionSections[riskIndex];
                  const points = asList(inspectionSection?.points);
                  const issuePoints = points.filter(isInspectionIssue);
                  const otherPoints = points.filter((point) => !isInspectionIssue(point));
                  const sectionKey = inspectionSection?.id || risk.id || `risk-${riskIndex}`;
                  const isExpanded = Boolean(expandedInspectionSections[sectionKey]);
                  const visiblePoints = isExpanded ? [...issuePoints, ...otherPoints] : [];
                  const pointsId = `${sectionId}-risk-points-${sectionKey}`;
                  const needsAttention = risk.tone === "attention" || risk.tone === "critical";

                  return (
                    <article className={risk.tone || "confirmed"} key={risk.id || risk.title}>
                      <div className="service-report-risk-summary">
                        <span aria-hidden="true"><StatusIcon tone={risk.tone} size={24} /></span>
                        <div>
                          <h4>{risk.title}</h4>
                          <strong>
                            {needsAttention && <em>Требует внимания.</em>}
                            <span>{risk.status}</span>
                          </strong>
                          {risk.note && <p>{risk.note}</p>}
                        </div>
                        {points.length > 0 && (
                          <button
                            className="service-report-risk-summary-toggle"
                            type="button"
                            aria-label={`${isExpanded ? "Свернуть" : "Подробнее"}: ${risk.title}`}
                            aria-expanded={isExpanded}
                            aria-controls={isExpanded ? pointsId : undefined}
                            onClick={() => setExpandedInspectionSections((current) => ({
                              ...current,
                              [sectionKey]: !current[sectionKey],
                            }))}
                          >
                            <CaretDown size={24} weight="bold" aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {visiblePoints.length > 0 && (
                        <div className="service-report-inspection-list service-report-risk-points" id={pointsId}>
                          {visiblePoints.map((point) => (
                            <InspectionPointRow
                              key={point.id}
                              point={point}
                              photoIndexById={photoIndexById}
                              onOpenPhotos={openLinkedPhotos}
                            />
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}

                {allPhotos.length > 0 && (
                  <article className="confirmed service-report-photo-section">
                    <div className="service-report-risk-summary">
                      <span aria-hidden="true"><Camera size={24} weight="fill" /></span>
                      <div>
                        <h4>{report.labels?.evidenceTitle || "Фотофиксация по пунктам отчёта"}</h4>
                        <strong>{allPhotos.length} фото</strong>
                      </div>
                      <button
                        className="service-report-risk-summary-toggle"
                        type="button"
                        aria-label={`${isPhotoEvidenceExpanded ? "Свернуть" : "Подробнее"}: ${report.labels?.evidenceTitle || "Фотофиксация по пунктам отчёта"}`}
                        aria-expanded={isPhotoEvidenceExpanded}
                        aria-controls={isPhotoEvidenceExpanded ? photoEvidenceId : undefined}
                        onClick={() => setExpandedInspectionSections((current) => ({
                          ...current,
                          [PHOTO_EVIDENCE_SECTION_KEY]: !current[PHOTO_EVIDENCE_SECTION_KEY],
                        }))}
                      >
                        <CaretDown size={24} weight="bold" aria-hidden="true" />
                      </button>
                    </div>

                    {isPhotoEvidenceExpanded && (
                      <div className="service-report-risk-photo-panel" id={photoEvidenceId}>
                        <div className="service-report-photo-grid service-report-photo-gallery">
                          {allPhotos.map((photo, photoIndex) => (
                            <figure key={photo.key}>
                              <button
                                type="button"
                                onClick={() => openPhotoSet(allPhotoIndexes, photoIndex)}
                                aria-label={`Открыть фото: ${photo.caption}`}
                              >
                                <img
                                  src={photo.src}
                                  width={photo.width || 960}
                                  height={photo.height || 720}
                                  alt={photo.alt}
                                  loading="lazy"
                                  decoding="async"
                                />
                                <span aria-hidden="true"><MagnifyingGlass size={21} weight="bold" /></span>
                              </button>
                              <figcaption>{photo.caption}</figcaption>
                            </figure>
                          ))}
                        </div>
                      </div>
                    )}
                  </article>
                )}
              </div>
            </section>
          )}

        {report.recommendation && (
          <section className={`service-report-recommendation${recommendationSteps.length === 0 ? " is-summary-only" : ""}`} aria-labelledby={`${sectionId}-recommendation`}>
            <div className="service-report-recommendation-copy">
              <span aria-hidden="true"><ClipboardText size={25} weight="duotone" /></span>
              <div>
                <p>{report.recommendation.eyebrow || "Рекомендация специалиста"}</p>
                <h3 id={`${sectionId}-recommendation`}>{report.recommendation.title}</h3>
                {report.recommendation.summary && <p>{report.recommendation.summary}</p>}
              </div>
            </div>
            {recommendationSteps.length > 0 && (
              <ol>
                {recommendationSteps.map((step, index) => (
                  <li key={step.id || step.text || step}><span>{index + 1}</span><p>{step.text || step}</p></li>
                ))}
              </ol>
            )}
          </section>
        )}

        {report.powertrainNote?.text && (
          <p className="service-report-electric-note">
            <BatteryHigh size={22} weight="duotone" aria-hidden="true" />
            <span>{report.powertrainNote.text}</span>
          </p>
        )}
      </article>

      {activePhoto && (
        <div className="service-report-photo-viewer" role="dialog" aria-modal="true" aria-labelledby={`${sectionId}-viewer-caption`} onClick={() => setViewer(null)}>
          <div className="service-report-photo-viewer-card" onClick={(event) => event.stopPropagation()}>
            <button className="service-report-photo-viewer-close" type="button" onClick={() => setViewer(null)} aria-label="Закрыть фотографию" autoFocus>
              <X size={22} weight="bold" />
            </button>
            <img src={activePhoto.src} width={activePhoto.width || 960} height={activePhoto.height || 720} alt={activePhoto.alt} />
            <footer>
              <div>
                <span>{(viewer?.position || 0) + 1} / {viewerPhotoIndexes.length}</span>
                <p id={`${sectionId}-viewer-caption`}>
                  <span>{viewer?.description || activePhoto.caption}</span>
                  {viewer?.description && <small>{activePhoto.caption}</small>}
                </p>
              </div>
              {viewerPhotoIndexes.length > 1 && (
                <nav aria-label="Фотографии отчёта">
                  <button type="button" onClick={() => moveViewer(-1)} aria-label="Предыдущее фото"><ArrowLeft size={20} /></button>
                  <button type="button" onClick={() => moveViewer(1)} aria-label="Следующее фото"><ArrowRight size={20} /></button>
                </nav>
              )}
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
