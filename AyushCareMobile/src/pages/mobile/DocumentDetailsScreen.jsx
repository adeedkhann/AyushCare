import React, { useMemo } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Building2,
  Stethoscope,
  Pill,
  AlertCircle,
  CheckCircle2,
  Eye,
  Edit2,
  FileText,
  FlaskConical,
  ClipboardList,
  UserRound,
  Clock3,
  ChevronRight,
} from "lucide-react";

import useMobileStore, { SCREENS } from "../../store/useMobileStore";
import MobileHeader from "../../components/mobile/MobileHeader";
import OriginalDocModal from "../../components/mobile/OriginalDocModal";
import EditItemModal from "../../components/mobile/EditItemModal";
import useLanguage, { tr } from "../../i18n/translations";

const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
};

const getTypeLabel = (record, isHindi) => {
  switch (record?.type) {
    case "prescription":
      return tr('Prescription', 'पर्चा');
    case "lab_report":
      return tr('Lab Report', 'लैब रिपोर्ट');
    case "discharge_summary":
      return tr('Discharge Summary', 'डिस्चार्ज सारांश');
    default:
      return record?.typeLabel || (tr('Medical Record', 'अन्य रिकॉर्ड'));
  }
};

const StatusBadge = ({ status, isHindi }) => {
  const config = {
    UPLOADED: {
      icon: Clock3,
      label: tr('Uploaded', 'अपलोड किया गया'),
      className: "bg-slate-100 text-slate-700 border-slate-300",
    },
    CONFIRMED: {
      icon: CheckCircle2,
      label: tr('Confirmed', 'सत्यापित'),
      className: "bg-teal-50 text-teal-800 border-teal-200",
    },
    NEEDS_REVIEW: {
      icon: AlertCircle,
      label: tr('Needs Review', 'समीक्षा आवश्यक'),
      className: "bg-amber-50 text-amber-900 border-amber-300",
    },
    PROCESSING: {
      icon: Clock3,
      label: tr('Processing', 'प्रक्रिया जारी'),
      className: "bg-blue-50 text-blue-800 border-blue-200",
    },
    PROCESSED: {
      icon: CheckCircle2,
      label: tr('Processed', 'प्रसंस्कृत'),
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    COMPLETED: {
      icon: CheckCircle2,
      label: tr('Processed', 'प्रसंस्कृत'),
      className: "bg-emerald-50 text-emerald-800 border-emerald-200",
    },
    FAILED: {
      icon: AlertCircle,
      label: tr('Failed', 'विफल'),
      className: "bg-rose-50 text-rose-800 border-rose-200",
    },
  };

  const normalized = String(status || "PROCESSED").toUpperCase();
  const current = config[normalized] || config.PROCESSED;
  const Icon = current.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${current.className}`}
    >
      <Icon
        className={`w-3.5 h-3.5 ${
          normalized === "PROCESSING" ? "animate-spin" : ""
        }`}
      />
      {current.label}
    </span>
  );
};

const Section = ({ title, icon: Icon, children }) => (
  <section className="p-4 sm:p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-3">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
      <Icon className="w-4 h-4 text-teal-800 shrink-0" />
      <h2 className="text-sm font-black text-slate-900">{title}</h2>
    </div>

    {children}
  </section>
);

const EmptyExtraction = ({ text }) => (
  <p className="text-xs text-slate-500 italic py-1">{text}</p>
);

const VerificationBadge = ({ needsVerification, isHindi }) => {
  if (needsVerification) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
        <AlertCircle className="w-3 h-3" />
        {tr('Verify', 'जांचें')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
      <CheckCircle2 className="w-3 h-3" />
      {tr('Verified', 'सत्यापित')}
    </span>
  );
};

export const DocumentDetailsScreen = () => {
  const {
    selectedMedicalRecord,
    medicalRecords,
    setOriginalDocModalOpen,
    setEditingEntity,
    setSelectedVisit,
    setScreen,
    prevScreen,
    setCapturedDocument,
    setActiveNavTab,
  } = useMobileStore();

  const { isHindi, tr } = useLanguage();

  const record = useMemo(() => {
    if (selectedMedicalRecord) {
      return selectedMedicalRecord;
    }

    if (Array.isArray(medicalRecords) && medicalRecords.length > 0) {
      return medicalRecords[0];
    }

    return null;
  }, [selectedMedicalRecord, medicalRecords]);

  const associatedVisit = useMemo(() => {
    if (!record?.visitId) return null;

    return (
      (Array.isArray([])
        ? [].find((visit) => visit.id === record.visitId)
        : null) || null
    );
  }, [record]);

  const rawExtraction =
    record?.extractedInformation ||
    record?.extracted_data ||
    record?.extraction ||
    record?.extractedData ||
    {};

  const extraction = useMemo(() => {
    if (!rawExtraction) return {};
    if (typeof rawExtraction === "string") {
      try {
        return JSON.parse(rawExtraction);
      } catch {
        return {};
      }
    }
    return rawExtraction;
  }, [rawExtraction]);

  const medicines = normalizeArray(
    extraction?.medicines || extraction?.medications
  );
  const investigations = normalizeArray(
    extraction?.investigations || extraction?.lab_results || extraction?.tests
  );
  const procedures = normalizeArray(extraction?.procedures);
  const diagnosis = normalizeArray(
    extraction?.diagnosis || extraction?.diagnoses || extraction?.conditions
  );
  const recordDetails = normalizeArray(
    extraction?.recordDetails || extraction?.details
  );

  const date =
    record?.displayDate ||
    record?.date ||
    record?.createdAt ||
    record?.created_at ||
    (tr('Date unavailable', 'तारीख उपलब्ध नहीं'));

  const source =
    record?.source ||
    record?.clinic ||
    record?.hospital ||
    (tr('Healthcare facility', 'स्वास्थ्य केंद्र'));

  const fileUrl =
    record?.download_url ||
    record?.document_url ||
    record?.file_url ||
    record?.url ||
    (record?.file_path_hash && String(record.file_path_hash).startsWith("http") ? record.file_path_hash : null) ||
    record?.dataUrl ||
    record?.image ||
    null;

  const pages = useMemo(() => {
    if (Array.isArray(record?.pages) && record.pages.length > 0) {
      return record.pages;
    }
    if (fileUrl) {
      const isPdf = Boolean(
        record?.source_mime_type?.includes("pdf") ||
        String(fileUrl).toLowerCase().includes(".pdf")
      );
      return [{
        id: `${record.id || "record"}-page-1`,
        fileName: record.fileName || record.title || record.file_name || "Medical document",
        dataUrl: fileUrl,
        image: fileUrl,
        previewUrl: fileUrl,
        imageUrl: fileUrl,
        mimeType: record?.source_mime_type || (isPdf ? "application/pdf" : "image/jpeg"),
      }];
    }
    return [];
  }, [record, fileUrl]);

  const totalPages =
    pages.length > 0
      ? pages.length
      : Number(record?.totalPages || 1);

  const handleViewOriginal = () => {
    if (!record) return;

    const documentPages = pages.map((page, index) => ({
      ...page,
      id: page?.id || `${record.id || "record"}-page-${index + 1}`,
      fileName:
        page?.fileName ||
        page?.name ||
        `${record.title || "Medical Document"} · Page ${index + 1}`,
      image:
        page?.image ||
        page?.dataUrl ||
        page?.imageSrc ||
        fileUrl ||
        null,
      dataUrl:
        page?.dataUrl ||
        page?.image ||
        page?.imageSrc ||
        fileUrl ||
        null,
      mimeType: page?.mimeType || (String(fileUrl || '').toLowerCase().includes('.pdf') ? 'application/pdf' : 'image/jpeg'),
    }));

    setCapturedDocument({
      id: record.id,
      fileName:
        record.fileName ||
        record.title ||
        record.file_name ||
        "Medical_Document",
      date,
      doctor: record.doctor || "",
      clinic: source,
      summary: extraction?.summary || record?.summary || extraction?.ai_summary || null,
      health_info: extraction?.health_info || record?.health_info || null,
      extractedInformation: extraction,
      documents: medicalRecords,
      document_url: fileUrl,
      download_url: fileUrl,
      url: fileUrl,
      mimeType: record?.source_mime_type || (String(fileUrl || '').toLowerCase().includes('.pdf') ? 'application/pdf' : undefined),
      dataUrl:
        fileUrl ||
        record.dataUrl ||
        record.download_url ||
        record.image ||
        documentPages[0]?.dataUrl ||
        null,
      pages: documentPages,
      totalPages,
    });

    setOriginalDocModalOpen(true);
  };

  const handleOpenAssociatedVisit = () => {
    if (!associatedVisit) return;

    setSelectedVisit(associatedVisit);
    setActiveNavTab("visits");
    setScreen(SCREENS.VISIT_DETAILS);
  };

  if (!record) {
    return (
      <div className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <MobileHeader
          title={tr('Document Details', 'दस्तावेज़ विवरण')}
          showBack={true}
          onBack={prevScreen}
        />

        <main className="flex-1 px-4 py-10 flex items-center justify-center">
          <div className="w-full max-w-md p-7 rounded-3xl bg-white border border-slate-200 text-center shadow-xs">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7 text-slate-500" />
            </div>

            <h1 className="mt-4 text-lg font-black">
              {tr('Document unavailable', 'दस्तावेज़ उपलब्ध नहीं है')}
            </h1>

            <p className="mt-1.5 text-xs text-slate-500">
              {tr('Please open the document again from your records.', 'कृपया रिकॉर्ड सूची से दस्तावेज़ दोबारा खोलें।')}
            </p>

            <button
              type="button"
              onClick={prevScreen}
              className="mt-5 w-full h-11 rounded-xl bg-teal-800 text-white text-xs font-bold cursor-pointer"
            >
              {tr('Go back', 'वापस जाएं')}
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col bg-slate-50 text-slate-900 select-none">
      <MobileHeader
        title={tr('Document Details', 'दस्तावेज़ विवरण')}
        showBack={true}
        onBack={prevScreen}
      />

      <main className="flex-1 px-4 sm:px-6 py-4 sm:py-6 max-w-md md:max-w-2xl lg:max-w-3xl mx-auto w-full space-y-5">
        {/* Document overview */}
        <section className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-black uppercase tracking-wide">
              <FileText className="w-3.5 h-3.5" />
              {getTypeLabel(record, isHindi)}
            </span>

            <StatusBadge
              status={record.status}
              isHindi={isHindi}
            />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black leading-snug break-words">
              {record.title ||
                (tr('Medical Record', 'चिकित्सीय रिकॉर्ड'))}
            </h1>

            <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-slate-500">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                {date}
              </span>

              <span>·</span>

              <span className="inline-flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {source}
              </span>

              {totalPages > 1 && (
                <>
                  <span>·</span>
                  <span className="font-semibold text-teal-800">
                    {totalPages} {tr('pages', 'पृष्ठ')}
                  </span>
                </>
              )}
            </div>

            {(record.doctor || record.department) && (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
                <UserRound className="w-3.5 h-3.5 text-slate-400" />

                <span>
                  {record.doctor || ""}
                  {record.doctor && record.department ? " · " : ""}
                  {record.department || ""}
                </span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
            <div className="text-[11px] text-slate-400 leading-relaxed">
              {tr('Information extracted from the source document', 'मूल दस्तावेज़ से निकाली गई जानकारी')}
            </div>

            <button
              type="button"
              onClick={handleViewOriginal}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold hover:bg-teal-100 active:scale-95 transition cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              {tr('View Original', 'मूल देखें')}
            </button>
          </div>
        </section>

        {/* AI Clinical Summary & Health Guidance */}
        {(extraction?.summary || record?.summary || extraction?.health_info || record?.health_info) && (
          <section className="p-5 rounded-3xl bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
              <ClipboardList className="w-4 h-4 text-teal-300 shrink-0" />
              <h2 className="text-sm font-black text-white">
                {tr('AI Clinical Summary & Health Review', 'एआई चिकित्सीय सारांश और समीक्षा')}
              </h2>
            </div>

            {(extraction?.summary || record?.summary) && (
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-teal-300">
                  {tr('Clinical Summary', 'नैदानिक सारांश')}
                </p>
                <p className="text-xs text-slate-100 leading-relaxed font-medium">
                  {extraction?.summary || record?.summary}
                </p>
              </div>
            )}

            {(extraction?.health_info || record?.health_info) && (
              <div className="pt-2 border-t border-white/10 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                  {tr('Health Guidance & Precautions', 'स्वास्थ्य मार्गदर्शन और सावधानियां')}
                </p>
                <p className="text-xs text-emerald-100 leading-relaxed font-medium">
                  {extraction?.health_info || record?.health_info}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Associated visit */}
        <Section
          title={
            tr('Associated Healthcare Encounter', 'संबंधित स्वास्थ्य परामर्श')
          }
          icon={Stethoscope}
        >
          {associatedVisit ? (
            <button
              type="button"
              onClick={handleOpenAssociatedVisit}
              className="w-full p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left flex items-center justify-between gap-3 hover:border-teal-500 transition cursor-pointer"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-teal-800">
                  {associatedVisit.date || ""}
                  {associatedVisit.department
                    ? ` · ${
                        isHindi
                          ? associatedVisit.hindiDepartment ||
                            associatedVisit.department
                          : associatedVisit.department
                      }`
                    : ""}
                </p>

                <p className="text-sm font-black text-slate-900 mt-1">
                  {isHindi
                    ? associatedVisit.hindiDoctor ||
                      associatedVisit.doctor
                    : associatedVisit.doctor}
                </p>

                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isHindi
                    ? associatedVisit.hindiHospital ||
                      associatedVisit.hospital
                    : associatedVisit.hospital}
                </p>
              </div>

              <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
            </button>
          ) : (
            <p className="text-xs text-slate-500 italic">
              {tr('This record is not linked to a specific visit.', 'यह रिकॉर्ड किसी विशिष्ट मुलाकात से लिंक नहीं है।')}
            </p>
          )}
        </Section>

        {/* Safety note */}
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />

            <div>
              <p className="text-xs font-black text-amber-900">
                {tr('Information read from the document', 'दस्तावेज़ से निकाली गई जानकारी')}
              </p>

              <p className="text-[11px] text-amber-900/80 mt-1 leading-relaxed">
                {tr('Check medicines, investigations and other information against the original document. This is not a clinical decision.', 'किसी भी दवा, जांच या अन्य जानकारी को मूल दस्तावेज़ से मिलाकर देखें। यह नैदानिक निर्णय नहीं है।')}
              </p>
            </div>
          </div>
        </div>

        {/* Medicines */}
        <Section
          title={tr('Extracted Medicines', 'पहचानी गई दवाइयां')}
          icon={Pill}
        >
          {medicines.length === 0 ? (
            <EmptyExtraction
              text={
                tr('No medicines were extracted from this record.', 'इस रिकॉर्ड से कोई दवा नहीं मिली।')
              }
            />
          ) : (
            <div className="space-y-2.5">
              {medicines.map((medicine, index) => {
                const id = medicine?.id || `medicine-${index}`;

                return (
                  <div
                    key={id}
                    className={`p-3.5 rounded-2xl border ${
                      medicine?.needsVerification
                        ? "bg-amber-50/60 border-amber-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-900">
                          {medicine?.name ||
                            (tr('Medicine', 'दवा'))}
                        </p>

                        {(medicine?.dosage ||
                          medicine?.schedule ||
                          medicine?.frequency ||
                          medicine?.instruction) && (
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                            {[medicine?.dosage, medicine?.schedule || medicine?.frequency]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}

                        {medicine?.instruction && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            {medicine.instruction}
                          </p>
                        )}

                        {medicine?.needsVerification && (
                          <p className="text-[11px] text-amber-800 mt-2 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            {medicine?.verificationReason ||
                              (tr('Verify against the original document.', 'मूल पर्चे से मिलान करें।'))}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <VerificationBadge
                          needsVerification={
                            medicine?.needsVerification
                          }
                          isHindi={isHindi}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setEditingEntity({
                              type: "medicine",
                              data: medicine,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {tr('Edit', 'संपादित करें')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Lab investigations */}
        <Section
          title={tr('Investigations & Results', 'जांच परिणाम')}
          icon={FlaskConical}
        >
          {investigations.length === 0 ? (
            <EmptyExtraction
              text={
                tr('No investigation results were extracted.', 'इस रिकॉर्ड में कोई जांच परिणाम नहीं मिला।')
              }
            />
          ) : (
            <div className="space-y-2.5">
              {investigations.map((test, index) => {
                const id = test?.id || `investigation-${index}`;

                return (
                  <div
                    key={id}
                    className={`p-3.5 rounded-2xl border ${
                      test?.needsVerification
                        ? "bg-amber-50/60 border-amber-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">
                          {test?.testName ||
                            test?.name ||
                            test?.label ||
                            (tr('Investigation', 'जांच'))}
                        </p>

                        <p className="text-sm font-bold text-slate-700 mt-1">
                          {[test?.value, test?.unit]
                            .filter(Boolean)
                            .join(" ")}
                        </p>

                        {(test?.referenceRange || test?.reference_range) && (
                          <p className="text-[11px] text-slate-500 mt-1">
                            {tr('Reference range', 'संदर्भ सीमा')}:{" "}
                            {test.referenceRange || test.reference_range}
                          </p>
                        )}

                        {test?.needsVerification && (
                          <p className="text-[11px] text-amber-800 mt-2 flex items-start gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            {test?.verificationReason ||
                              (tr('Verify against the original report.', 'मूल रिपोर्ट से मिलान करें।'))}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <VerificationBadge
                          needsVerification={test?.needsVerification}
                          isHindi={isHindi}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setEditingEntity({
                              type: "investigation",
                              data: test,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {tr('Edit', 'संपादित करें')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Diagnosis */}
        <Section
          title={
            tr('Diagnosis / Document Information', 'निदान / दस्तावेज़ में लिखी जानकारी')
          }
          icon={Stethoscope}
        >
          {diagnosis.length === 0 ? (
            <EmptyExtraction
              text={
                tr('No specific diagnosis information was extracted.', 'कोई विशिष्ट निदान जानकारी नहीं मिली।')
              }
            />
          ) : (
            <div className="space-y-2.5">
              {diagnosis.map((item, index) => {
                const id = item?.id || `diagnosis-${index}`;
                const label = typeof item === "string" ? item : (item?.name || item?.diagnosis || item?.label || item?.value || "");

                return (
                  <div
                    key={id}
                    className={`p-3.5 rounded-2xl border ${
                      item?.needsVerification
                        ? "bg-amber-50/60 border-amber-300"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900">
                          {label}
                        </p>

                        {item?.needsVerification && (
                          <p className="text-[11px] text-amber-800 mt-1.5">
                            {item?.verificationReason ||
                              (tr('Verify against the original document.', 'मूल दस्तावेज़ से जांचें।'))}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-2">
                        <VerificationBadge
                          needsVerification={item?.needsVerification}
                          isHindi={isHindi}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            setEditingEntity({
                              type: "diagnosis",
                              data: {
                                id,
                                name: label,
                              },
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-bold text-teal-800 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {tr('Edit', 'संपादित करें')}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Other document details */}
        {recordDetails.length > 0 && (
          <Section
            title={
              tr('Document Details', 'दस्तावेज़ विवरण')
            }
            icon={ClipboardList}
          >
            <div className="space-y-2">
              {recordDetails.map((detail, index) => (
                <div
                  key={detail?.id || `detail-${index}`}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-wide font-bold text-slate-400">
                      {detail?.label || "Detail"}
                    </p>

                    <p className="text-sm font-bold text-slate-800 mt-0.5">
                      {detail?.value || ""}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingEntity({
                        type: "recordDetail",
                        data: detail,
                      })
                    }
                    className="shrink-0 text-xs font-bold text-teal-800 cursor-pointer"
                  >
                    {tr('Edit', 'संपादित करें')}
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Procedure */}
        {procedures.length > 0 && (
          <Section
            title={tr('Procedure Details', 'प्रक्रिया विवरण')}
            icon={ClipboardList}
          >
            <div className="space-y-2.5">
              {procedures.map((procedure, index) => (
                <div
                  key={
                    procedure?.id ||
                    `procedure-${index}`
                  }
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {procedure?.name ||
                        (tr('Procedure', 'प्रक्रिया'))}
                    </p>

                    {procedure?.notes && (
                      <p className="text-xs text-slate-500 mt-1">
                        {procedure.notes}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setEditingEntity({
                        type: "procedure",
                        data: procedure,
                      })
                    }
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-teal-800 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    {tr('Edit', 'संपादित करें')}
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Source metadata */}
        <section className="p-4 rounded-2xl bg-slate-100 border border-slate-200">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />

            <div>
              <p className="text-xs font-bold text-slate-700">
                {tr('Source', 'स्रोत')}
              </p>

              <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                {source}
                {record.doctor ? ` · ${record.doctor}` : ""}
              </p>

              <p className="text-[10px] text-slate-400 mt-1">
                {tr('This information is based on source details available with the record.', 'यह जानकारी रिकॉर्ड में उपलब्ध स्रोत विवरण पर आधारित है।')}
              </p>
            </div>
          </div>
        </section>

        {/* Back */}
        <div className="pb-6">
          <button
            type="button"
            onClick={prevScreen}
            className="w-full h-12 rounded-2xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            {tr('Back to Medical Records', 'चिकित्सीय रिकॉर्ड पर वापस जाएं')}
          </button>
        </div>
      </main>

      <OriginalDocModal />

      <EditItemModal />
    </div>
  );
};

export default DocumentDetailsScreen;