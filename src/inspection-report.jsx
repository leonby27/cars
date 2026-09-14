import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BatteryHigh,
  CaretRight,
  Check,
  CheckCircle,
  ClipboardText,
  Eye,
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
  limited: "Осмотр ограничен",
  "not-applicable": "Не предусмотрено",
});

function StatusIcon({ tone, size = 19 }) {
  if (tone === "attention" || tone === "critical") return <Info size={size} weight="duotone" />;
  return <CheckCircle size={size} weight="fill" />;
}

function InspectionStatusIcon({ status, size = 18 }) {
  if (status === "attention") return <Info size={size} weight="duotone" />;
  if (status === "limited") return <Info size={size} weight="duotone" />;
  if (status === "not-applicable") return <span aria-hidden="true">—</span>;
  return <CheckCircle size={size} weight="fill" />;
}

function factValue(fact, photoCount) {
  if (fact.metric === "photoCount") return String(photoCount);
  return fact.value;
}

function PhotoCarousel({ groupKey, photos, photoIndexByKey, onOpenPhoto }) {
  const carouselId = useId().replace(/:/g, "");
  const carouselRef = useRef(null);
  const [scrollState, setScrollState] = useState({ canScrollBack: false, canScrollForward: false });

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return undefined;

    const updateScrollState = () => {
      const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
      const firstPhotoButton = carousel.querySelector("figure > button");
      const carouselWrapper = carousel.parentElement;
      if (firstPhotoButton && carouselWrapper) {
        const wrapperRect = carouselWrapper.getBoundingClientRect();
        const buttonRect = firstPhotoButton.getBoundingClientRect();
        carouselWrapper.style.setProperty(
          "--service-report-carousel-arrow-center",
          `${buttonRect.top - wrapperRect.top + buttonRect.height / 2}px`,
        );
      }
      setScrollState({
        canScrollBack: carousel.scrollLeft > 2,
        canScrollForward: carousel.scrollLeft < maxScrollLeft - 2,
      });
    };

    updateScrollState();
    carousel.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState);
    resizeObserver?.observe(carousel);

    return () => {
      carousel.removeEventListener("scroll", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [photos.length]);

  const moveCarousel = (direction) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const firstPhoto = carousel.querySelector("figure");
    const computedStyle = window.getComputedStyle(carousel);
    const gap = Number.parseFloat(computedStyle.columnGap || computedStyle.gap) || 0;
    const step = (firstPhoto?.getBoundingClientRect().width || carousel.clientWidth) + gap;
    carousel.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <div className="service-report-photo-carousel">
      <div
        id={`service-report-photo-carousel-${carouselId}`}
        className={`service-report-photo-grid photos-${photos.length}`}
        ref={carouselRef}
      >
        {photos.map((photo, photoIndexInGroup) => {
          const photoKey = photo.id || `photo-${photoIndexInGroup}`;
          const photoIndex = photoIndexByKey.get(`${groupKey}:${photoKey}`);
          return (
            <figure key={photo.id || photo.src}>
              <button type="button" onClick={() => onOpenPhoto(photoIndex)} aria-label={`Открыть фото: ${photo.caption}`}>
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
          );
        })}
      </div>

      {scrollState.canScrollBack && (
        <button
          className="service-report-photo-carousel-arrow previous"
          type="button"
          aria-label="Предыдущие фото"
          aria-controls={`service-report-photo-carousel-${carouselId}`}
          onClick={() => moveCarousel(-1)}
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      )}
      {scrollState.canScrollForward && (
        <button
          className="service-report-photo-carousel-arrow next"
          type="button"
          aria-label="Следующие фото"
          aria-controls={`service-report-photo-carousel-${carouselId}`}
          onClick={() => moveCarousel(1)}
        >
          <ArrowRight size={20} weight="bold" />
        </button>
      )}
    </div>
  );
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
  const findings = asList(report?.findings);
  const limitationItems = asList(report?.limitations?.items);
  const recommendationSteps = asList(report?.recommendation?.steps);
  const vehicleMeta = asList(report?.vehicle?.meta);
  const allPhotos = useMemo(
    () => photoGroups.flatMap((group, groupIndex) => {
      const groupKey = group.id || `group-${groupIndex}`;
      return asList(group.photos).map((photo, photoIndex) => ({
        ...photo,
        groupId: groupKey,
        groupTitle: group.title,
        key: `${groupKey}:${photo.id || `photo-${photoIndex}`}`,
      }));
    }),
    [photoGroups],
  );
  const photoIndexByKey = useMemo(
    () => new Map(allPhotos.map((photo, index) => [photo.key, index])),
    [allPhotos],
  );
  const photoIndexById = useMemo(
    () => new Map(allPhotos.map((photo, index) => [photo.id, index]).filter(([photoId]) => photoId)),
    [allPhotos],
  );
  const firstInspectionSectionId = inspectionSections[0]?.id || "";
  const [activeInspectionSectionId, setActiveInspectionSectionId] = useState(firstInspectionSectionId);
  const [showInspectionIssuesOnly, setShowInspectionIssuesOnly] = useState(false);
  const [viewer, setViewer] = useState(null);
  const activeInspectionSection = inspectionSections.find((section) => section.id === activeInspectionSectionId) || inspectionSections[0] || null;
  const visibleInspectionPoints = asList(activeInspectionSection?.points).filter((point) => (
    !showInspectionIssuesOnly || point.status === "attention" || point.status === "limited"
  ));
  const viewerPhotoIndexes = asList(viewer?.photoIndexes);
  const activePhotoIndex = viewerPhotoIndexes[viewer?.position ?? -1];
  const activePhoto = Number.isInteger(activePhotoIndex) ? allPhotos[activePhotoIndex] : null;

  const openPhotoSet = (photoIndexes, title = "", initialPosition = 0, description = "") => {
    const validIndexes = photoIndexes.filter((index) => Number.isInteger(index) && allPhotos[index]);
    if (validIndexes.length === 0) return;
    setViewer({ photoIndexes: validIndexes, position: Math.min(Math.max(initialPosition, 0), validIndexes.length - 1), title, description });
  };

  const openLinkedPhotos = (photoIds, title, description = "") => {
    openPhotoSet(asList(photoIds).map((photoId) => photoIndexById.get(photoId)), title, 0, description);
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
    setActiveInspectionSectionId(firstInspectionSectionId);
    setShowInspectionIssuesOnly(false);
  }, [firstInspectionSectionId, report?.id]);

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
        <h2 id={`${sectionId}-title`}>{report.presentation?.title || "Что вы узнаете до оплаты автомобиля"}</h2>
        {report.presentation?.description && <p>{report.presentation.description}</p>}
      </div>

      <article className="service-report-sheet">
        <header className="service-report-vehicle">
          <div className="service-report-vehicle-top">
            <div className="service-report-vehicle-identity">
              <h3>{report.vehicle.name}</h3>
              {vehicleMeta.length > 0 && (
                <dl>
                  {vehicleMeta.map((item) => (
                    <div key={item.id || item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                  ))}
                </dl>
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

          {risks.length > 0 && (
            <section className="service-report-vehicle-risks" aria-label={report.labels?.risksTitle || "Ключевые риски"}>
              <div className="service-report-risk-grid">
                {risks.map((risk) => (
                  <article className={risk.tone || "confirmed"} key={risk.id || risk.title}>
                    <div>
                      <span aria-hidden="true"><StatusIcon tone={risk.tone} size={24} /></span>
                      {risk.checked && <small>{risk.checked}</small>}
                    </div>
                    <h4>{risk.title}</h4>
                    <strong>{risk.status}</strong>
                    {risk.note && <p>{risk.note}</p>}
                  </article>
                ))}
              </div>
            </section>
          )}
        </header>

        {inspectionSections.length > 0 && (
          <section className="service-report-inspection" aria-labelledby={`${sectionId}-inspection`}>
            <div className="service-report-subheading service-report-inspection-heading">
              <h3 id={`${sectionId}-inspection`}>{report.labels?.inspectionTitle || "Что именно проверили"}</h3>
              <label className="service-report-inspection-filter">
                <input
                  type="checkbox"
                  checked={showInspectionIssuesOnly}
                  onChange={(event) => setShowInspectionIssuesOnly(event.target.checked)}
                />
                <span aria-hidden="true" />
                Только замечания и ограничения
              </label>
            </div>

            <div className="service-report-inspection-tabs" role="tablist" aria-label="Разделы проверки автомобиля">
              {inspectionSections.map((inspectionSection, inspectionSectionIndex) => {
                const isActive = inspectionSection.id === activeInspectionSection?.id;
                return (
                  <button
                    id={`${sectionId}-inspection-tab-${inspectionSection.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`${sectionId}-inspection-panel-${inspectionSection.id}`}
                    tabIndex={isActive ? 0 : -1}
                    className={isActive ? "active" : ""}
                    key={inspectionSection.id}
                    onClick={() => setActiveInspectionSectionId(inspectionSection.id)}
                    onKeyDown={(event) => {
                      const keyDirection = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                      const nextIndex = event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? inspectionSections.length - 1
                          : keyDirection
                            ? (inspectionSectionIndex + keyDirection + inspectionSections.length) % inspectionSections.length
                            : null;
                      if (nextIndex === null) return;
                      event.preventDefault();
                      setActiveInspectionSectionId(inspectionSections[nextIndex].id);
                      event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
                    }}
                  >
                    {inspectionSection.title}
                  </button>
                );
              })}
            </div>

            {activeInspectionSection && (
              <div
                className="service-report-inspection-panel"
                id={`${sectionId}-inspection-panel-${activeInspectionSection.id}`}
                role="tabpanel"
                aria-labelledby={`${sectionId}-inspection-tab-${activeInspectionSection.id}`}
              >
                {visibleInspectionPoints.length > 0 ? (
                  <div className="service-report-inspection-list">
                    {visibleInspectionPoints.map((point) => {
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
                              <Images size={18} weight="duotone" />
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
                          key={point.id}
                          onClick={() => openLinkedPhotos(linkedPhotoIds, point.label, point.detail)}
                          aria-label={`${point.label}. ${INSPECTION_STATUS_LABELS[status]}. Открыть ${linkedPhotoCount} фото`}
                        >
                          {rowContent}
                        </button>
                      ) : (
                        <div className={`service-report-inspection-row ${status}`} key={point.id}>
                          {rowContent}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="service-report-inspection-empty">В этом разделе нет замечаний или зон с ограниченным доступом.</p>
                )}
              </div>
            )}
          </section>
        )}

        {allPhotos.length > 0 && (
          <section className="service-report-evidence" aria-labelledby={`${sectionId}-evidence`}>
            <div className="service-report-subheading">
              <h3 id={`${sectionId}-evidence`}>{report.labels?.evidenceTitle || "Фотофиксация по пунктам отчёта"}</h3>
            </div>
            <div className="service-report-evidence-groups">
              {photoGroups.map((group, groupIndex) => {
                const groupKey = group.id || `group-${groupIndex}`;
                return (
                  <article className={`service-report-evidence-group ${group.tone || "confirmed"}`} key={groupKey}>
                    <header>
                      <span aria-hidden="true"><StatusIcon tone={group.tone} size={28} /></span>
                      <div>
                        <h4>{group.title}</h4>
                        {group.result && <p>{group.result}</p>}
                      </div>
                    </header>
                    <PhotoCarousel
                      groupKey={groupKey}
                      photos={asList(group.photos)}
                      photoIndexByKey={photoIndexByKey}
                      onOpenPhoto={(photoIndex) => openPhotoSet(allPhotos.map((_, index) => index), "", photoIndex)}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {(facts.length > 0 || findings.length > 0) && (
          <div className="service-report-details-grid">
            {facts.length > 0 && (
              <section className="service-report-facts" aria-labelledby={`${sectionId}-facts`}>
                <div className="service-report-subheading">
                  <h3 id={`${sectionId}-facts`}>{report.labels?.factsTitle || "Данные автомобиля"}</h3>
                </div>
                <dl>
                  {facts.map((fact) => (
                    <div key={fact.id || fact.label}><dt>{fact.label}</dt><dd>{factValue(fact, allPhotos.length)}</dd></div>
                  ))}
                </dl>
              </section>
            )}

            {findings.length > 0 && (
              <section className="service-report-findings" aria-labelledby={`${sectionId}-findings`}>
                <div className="service-report-subheading">
                  <h3 id={`${sectionId}-findings`}>{report.labels?.findingsTitle || "Что обнаружили"}</h3>
                </div>
                <ul>
                  {findings.map((finding, index) => (
                    <li key={finding.id || finding.text} className={finding.tone || "confirmed"}>
                      <span aria-hidden="true">{finding.tone === "confirmed" ? <Check size={15} weight="bold" /> : index + 1}</span>
                      <div>
                        <p>{finding.text}</p>
                        {asList(finding.photoIds).some((photoId) => photoIndexById.has(photoId)) && (
                          <button type="button" onClick={() => openLinkedPhotos(finding.photoIds, finding.title || finding.text, finding.text)}>
                            <Images size={17} weight="duotone" aria-hidden="true" />
                            Открыть фото
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {limitationItems.length > 0 && (
          <aside className={`service-report-limitations${report.limitations.badge ? " has-badge" : ""}`}>
            <span aria-hidden="true"><Eye size={24} weight="duotone" /></span>
            <div>
              <h3>{report.limitations.title || "Что не удалось проверить полностью"}</h3>
              <ul>{limitationItems.map((item) => <li key={item.id || item.text}>{item.text || item}</li>)}</ul>
            </div>
            {report.limitations.badge && <strong>{report.limitations.badge}</strong>}
          </aside>
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
                  <strong>{viewer?.title || activePhoto.groupTitle}</strong>
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
