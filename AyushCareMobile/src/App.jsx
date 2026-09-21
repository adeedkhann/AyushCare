import React, { lazy, Suspense, useEffect,useState, useRef } from "react";
import { Toaster } from "sonner";

import useMobileStore, { SCREENS } from "./store/useMobileStore";

import LanguageSwitcher from "./components/mobile/LanguageSwitcher";
import BottomNavBar from "./components/mobile/BottomNavBar";
import { exchangePatientQrToken } from "./services/authService";
import useDomTranslation from "./hooks/useDomTranslation";

const AuthScreen = lazy(() => import("./pages/mobile/AuthScreen"));
const M1MobileHome = lazy(() => import("./pages/mobile/M1_MobileHome"));
const M2DocumentType = lazy(() => import("./pages/mobile/M2_DocumentType"));
const M3DocumentCapture = lazy(() => import("./pages/mobile/M3_DocumentCapture"));
const M4DocumentReview = lazy(() => import("./pages/mobile/M4_DocumentReview"));
const M5DocumentAnalysis = lazy(() => import("./pages/mobile/M5_DocumentAnalysis"));
const M6ExtractedInformation = lazy(() => import("./pages/mobile/M6_ExtractedInformation"));
const M7MedicalTimeline = lazy(() => import("./pages/mobile/M7_MedicalTimeline"));
const M8HealthSummary = lazy(() => import("./pages/mobile/M8_HealthSummary"));
const M9InformationSent = lazy(() => import("./pages/mobile/M9_InformationSent"));
const AppointmentsScreen = lazy(() => import("./pages/mobile/AppointmentsScreen"));
const MyVisitsScreen = lazy(() => import("./pages/mobile/MyVisitsScreen"));
const VisitDetailsScreen = lazy(() => import("./pages/mobile/VisitDetailsScreen"));
const RecordsScreen = lazy(() => import("./pages/mobile/RecordsScreen"));
const DocumentDetailsScreen = lazy(() => import("./pages/mobile/DocumentDetailsScreen"));
const MoreScreen = lazy(() => import("./pages/mobile/MoreScreen"));
const PrivacyScreen = lazy(() => import("./pages/mobile/PrivacyScreen"));
const ConsentDetailsScreen = lazy(() => import("./pages/mobile/ConsentDetailsScreen"));
const ProfileScreen = lazy(() => import("./pages/mobile/ProfileScreen"));
const SettingsScreen = lazy(() => import("./pages/mobile/SettingsScreen"));
const AboutScreen = lazy(() => import("./pages/mobile/AboutScreen"));

const HEADER_SCREENS = new Set([
  SCREENS.M1,
  SCREENS.VISITS,
  SCREENS.VISIT_DETAILS,
  SCREENS.APPOINTMENTS,
  SCREENS.RECORDS,
  SCREENS.DOCUMENT_DETAILS,
  SCREENS.MORE,
  SCREENS.PRIVACY,
  SCREENS.CONSENT_DETAILS,
  SCREENS.PROFILE,
  SCREENS.SETTINGS,
  SCREENS.ABOUT,
]);

import ErrorBoundary from "./components/common/ErrorBoundary";

function App() {
  useDomTranslation();
  const {
    currentScreen,
    isAuthenticated,
    accessibilitySettings,
    setScreen,
    setDocumentUploadContext,
  } = useMobileStore();

  const qrExchangeInProgressRef = useRef(false);

  const LoadingScreen = ({ message = "Loading AyushCare…", detail = "Please wait while we prepare your secure patient view." }) => (
    <div className="mobile-app-loading" role="status" aria-live="polite">
      <div className="mobile-loading-orbit" aria-hidden="true"><div className="mobile-loading-spinner" /></div>
      <strong>{message}</strong>
      <span>{detail}</span>
    </div>
  );

  const [isExchangingQr, setIsExchangingQr] = useState(() => {
    if (typeof window === "undefined") return false;
    const searchParam = new URLSearchParams(window.location.search).get("qr_token");
    if (searchParam) return true;
    if (window.location.hash.includes("?")) {
      const hashQuery = window.location.hash.substring(window.location.hash.indexOf("?"));
      if (new URLSearchParams(hashQuery).get("qr_token")) return true;
    }
    return Boolean(window.location.href.match(/[?&]qr_token=([^&#]+)/));
  });

  /* ---------------------------------------------------------------------- */
  /* ACCESSIBILITY                                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const size = accessibilitySettings?.textSize || "default";

    document.documentElement.setAttribute(
      "data-text-size",
      size
    );

    if (accessibilitySettings?.highContrast) {
      document.documentElement.setAttribute(
        "data-high-contrast",
        "true"
      );
    } else {
      document.documentElement.removeAttribute(
        "data-high-contrast"
      );
    }

    // Clean up reduce-motion attribute so animations and spinners are always lively
    document.documentElement.removeAttribute("data-reduce-motion");
    try {
      const stored = localStorage.getItem("ayushcare_accessibility");
      if (stored && stored.includes("reduceMotion")) {
        const parsed = JSON.parse(stored);
        delete parsed.reduceMotion;
        localStorage.setItem("ayushcare_accessibility", JSON.stringify(parsed));
      }
    } catch {}
  }, [accessibilitySettings]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-mobile-screen", currentScreen);
  }, [currentScreen]);

  /* ---------------------------------------------------------------------- */
  /* PATIENT QR ENTRY                                                       */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === "undefined") return;

    const getQrToken = () => {
      // 1. Direct search param
      const searchParam = new URLSearchParams(window.location.search).get("qr_token");
      if (searchParam) return searchParam;
      // 2. Hash query param (e.g. #/?qr_token=...)
      if (window.location.hash.includes("?")) {
        const hashQuery = window.location.hash.substring(window.location.hash.indexOf("?"));
        const hashParam = new URLSearchParams(hashQuery).get("qr_token");
        if (hashParam) return hashParam;
      }
      // 3. Fallback regex across full URL
      const match = window.location.href.match(/[?&]qr_token=([^&#]+)/);
      return match ? decodeURIComponent(match[1]) : null;
    };

    const token = getQrToken();
    if (!token) {
      setIsExchangingQr(false);
      // Check if there is an active upload consultation saved in session
      try {
        const savedConsultationId = sessionStorage.getItem("ayushcare_upload_consultation_id");
        if (savedConsultationId && !useMobileStore.getState().documentUploadContext?.consultationId) {
          setDocumentUploadContext({
            consultationId: savedConsultationId,
            source: "patient_qr",
          });
        }
      } catch {}
      return;
    }

    if (qrExchangeInProgressRef.current) return;
    qrExchangeInProgressRef.current = true;

    (async () => {
      try {
        const result = await exchangePatientQrToken(token);
        qrExchangeInProgressRef.current = false;

        const patientData = result.patient || result.user || {};
        const patient = {
          ...patientData,
          accessToken: result.accessToken,
          targetScreen: SCREENS.M2,
        };

        if (result.consultation_id) {
          try {
            sessionStorage.setItem("ayushcare_upload_consultation_id", result.consultation_id);
          } catch {}
        }

        useMobileStore.getState().setVerifiedPatient(patient, "QR");
        useMobileStore.getState().setDocumentUploadContext({
          consultationId: result.consultation_id || null,
          source: "patient_qr",
        });
        useMobileStore.setState({ 
          documentProcessingConsent: Boolean(result.document_processing_consent),
          isAuthenticated: true,
          currentScreen: SCREENS.M2,
          screenHistory: [SCREENS.M2],
        });

        // Clean query param from URL so browser refresh does not re-exchange expired token
        window.history.replaceState({ screen: SCREENS.M2 }, "", window.location.pathname);

        // Load dashboard, vitals, and visits in background safely
        useMobileStore.getState().loadPortalData?.().catch((err) => {
          console.warn("Background portal data sync:", err);
        });
      } catch (error) {
        qrExchangeInProgressRef.current = false;
        console.error("Patient QR login failed:", error);
        window.history.replaceState({}, "", window.location.pathname);
        if (!useMobileStore.getState().isAuthenticated) {
          useMobileStore.getState().setScreen(SCREENS.AUTH);
        }
      } finally {
        setIsExchangingQr(false);
      }
    })();
  }, [setDocumentUploadContext]);

  useEffect(() => {
    if (isAuthenticated) {
      useMobileStore.getState().loadPortalData?.();
    }
  }, [isAuthenticated]);

  /* ---------------------------------------------------------------------- */
  /* BROWSER HISTORY & BACK BUTTON SYNC                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Set initial history state if not set
    if (!window.history.state?.screen) {
      window.history.replaceState({ screen: currentScreen }, "", window.location.pathname);
    } else if (window.history.state?.screen !== currentScreen) {
      window.history.pushState({ screen: currentScreen }, "", window.location.pathname);
    }
  }, [currentScreen]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = (event) => {
      const targetScreen = event.state?.screen;
      if (targetScreen && Object.values(SCREENS).includes(targetScreen)) {
        useMobileStore.setState({ currentScreen: targetScreen });
      } else {
        const store = useMobileStore.getState();
        if (store.currentScreen !== SCREENS.M1 && store.currentScreen !== SCREENS.AUTH) {
          store.prevScreen();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* SCREEN ROUTER                                                          */
  /* ---------------------------------------------------------------------- */

  const renderScreen = () => {
    if (isExchangingQr) {
      return (
        <LoadingScreen message="Connecting to Kiosk Session…" detail="Verifying your patient account and opening document upload." />
      );
    }

    if (!isAuthenticated && currentScreen !== SCREENS.AUTH) {
      return <AuthScreen />;
    }

    switch (currentScreen) {
      case SCREENS.AUTH:
        return <AuthScreen />;
      case SCREENS.M1:
        return <M1MobileHome />;
      case SCREENS.M2:
        return <M2DocumentType />;
      case SCREENS.M3:
        return <M3DocumentCapture />;
      case SCREENS.M4:
        return <M4DocumentReview />;
      case SCREENS.M5:
        return <M5DocumentAnalysis />;
      case SCREENS.M6:
        return <M6ExtractedInformation />;
      case SCREENS.M7:
        return <M7MedicalTimeline />;
      case SCREENS.M8:
        return <M8HealthSummary />;
      case SCREENS.M9:
        return <M9InformationSent />;
      case SCREENS.VISITS:
        return <MyVisitsScreen />;
      case SCREENS.VISIT_DETAILS:
        return <VisitDetailsScreen />;
      case SCREENS.APPOINTMENTS:
        return <AppointmentsScreen />;
      case SCREENS.RECORDS:
        return <RecordsScreen />;
      case SCREENS.DOCUMENT_DETAILS:
        return <DocumentDetailsScreen />;
      case SCREENS.MORE:
        return <MoreScreen />;
      case SCREENS.PRIVACY:
        return <PrivacyScreen />;
      case SCREENS.CONSENT_DETAILS:
        return <ConsentDetailsScreen />;
      case SCREENS.PROFILE:
        return <ProfileScreen />;
      case SCREENS.SETTINGS:
        return <SettingsScreen />;
      case SCREENS.ABOUT:
        return <AboutScreen />;
      default:
        return isAuthenticated ? <M1MobileHome /> : <AuthScreen />;
    }
  };

  return (
    <>
      <Suspense
        fallback={
          <LoadingScreen />
        }
      >
        <ErrorBoundary onReset={() => setScreen(SCREENS.M1)}>
          {renderScreen()}
        </ErrorBoundary>
      </Suspense>

      {isAuthenticated && currentScreen !== SCREENS.AUTH && (
        <BottomNavBar />
      )}

      {!HEADER_SCREENS.has(currentScreen) && (
        <LanguageSwitcher floating />
      )}

      <Toaster position="top-center" richColors closeButton />
    </>
  );
}

export default App;
