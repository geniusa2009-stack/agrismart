/**
 * i18n/locales/ar-eg.js — العربية المصرية للفلاح (Egyptian
 * farmer-friendly mode).
 *
 * This is a SPARSE, deep-merged override on top of ar.js (general
 * Arabic), not a full duplicate dictionary — LocaleContext deep-merges
 * `ar` then `ar-eg` on top, so any key not listed here silently falls
 * back to the correct general-Arabic wording rather than to English or
 * a missing-key placeholder. Only keys where colloquial Egyptian
 * genuinely reads more naturally to a farmer are overridden here —
 * per the task brief's own examples (رطوبة الأرض vs رطوبة التربة,
 * محبس الميه vs الصمام, الأرض vs الحقل, بيانات الحساسات vs بيانات
 * المستشعرات) — scientific/technical terms that are already correct
 * and unambiguous in general Arabic (EC/الملوحة, دورة حياة الأمر) are
 * deliberately left un-overridden rather than forced into a colloquial
 * form that would sound performative or imprecise.
 */

const arEg = {
  meta: {
    localeName: 'المصرية (فلاح)',
    dir: 'rtl',
  },
  nav: {
    myFarm: 'أرضي',
  },
  alerts: {
    emptySub: 'كل حاجة تمام في الأرض دي.',
  },
  analytics: {
    soilMoisture: 'رطوبة الأرض (%)',
  },
  geminiCopilot: {
    subtitle: 'أرضك حالتها إيه دلوقتي؟',
    analyzeButton: 'حلّل الأرض',
    nextStepLabel: 'إيه تعمل بعد كده',
    decisionLabels: {
      irrigate_now: 'أروي دلوقتي',
      do_not_irrigate: 'الري مش لازم دلوقتي',
    },
    startIrrigationButton: 'ابدأ الري',
    simulationNote: 'مفيش جهاز حقيقي متوصل لسه — ده عرض لخطوات الأمر بس (تجربة برمجية)، والمحبس ما اتفتحش فعلياً.',
  },
  globalChat: {
    buttonLabel: 'اسأل المساعد',
    welcomeBody: 'اسألني عن أرضك، الري، الحساسات، أو أي مشكلة زراعية.',
    errors: {
      insufficient_data: 'لسه مفيش بيانات كفاية عشان أديك إجابة مضمونة عن حالة الأرض.',
    },
  },
  aiInsight: {
    unavailableMessage: 'لسه مفيش بيانات كفاية عشان نديك توصية مضمونة دلوقتي.',
    probabilityLabel: 'احتمال إن الأرض محتاجة ري في الـ3 ساعات الجاية',
  },
  farm: {
    devices: 'الحساسات',
    valves: 'محابس الميه',
    yourFarms: 'أراضيك',
    addFarm: 'ضيف أرض',
    farmName: 'اسم الأرض',
    village: 'البلد',
  },
  dashboard: {
    heroSubtitle: 'خلينا نشوف أرضك النهارده',
    quickActions: {
      equipment: 'أجّر معدة',
    },
    soilMoisture: 'رطوبة الأرض',
    ecSalinity: 'ملوحة التربة',
    devices: 'الحساسات',
    lastTelemetry: 'آخر قراءة من {{time}}',
    valveIsOpen: 'محبس {{valve}} مفتوح دلوقتي.',
    valveOpenDetail: 'محبس {{valve}} مفتوح',
    valveClosedDetail: 'محبس {{valve}} مقفول',
    noValveProvisioned: 'مفيش محبس متركّب لسه',
    waitingForReading: 'مستنيين قراءة',
    waitingForTelemetry: 'مستنيين بيانات من الحساس',
    waitingForTelemetryDetail: 'مفيش قراءة حديثة من الحساس.',
    waitingForDataDetail: 'لسه مفيش بيانات وصلت للأرض دي.',
    irrigationInProgress: 'الري شغّال دلوقتي',
    irrigationRecommended: 'الأرض محتاجة ري',
    belowThresholdDetail: 'رطوبة الأرض تحت الحد المحدد.',
    conditionsStable: 'الوضع تمام',
    aboveThresholdDetail: 'رطوبة الأرض فوق حد الري، مفيش داعي دلوقتي.',
    measureActiveDetail: 'الرطوبة {{pct}}% من قراءة الحساسات الحيّة.',
    understandDryDetail: 'التربة جافة (أقل من {{pct}}%).',
    howItWorks: 'AgriSmart بيشتغل إزاي — مباشر',
    recentIrrigationActivity: 'آخر حركات الري',
    noTelemetryYet: 'لسه مفيش قراءات من الحساس',
    couldNotLoad: 'مقدرناش نجيب بيانات لوحة التحكم',
  },
  irrigation: {
    valves: 'المحابس',
    soilCondition: 'حالة الأرض',
    waitingForTelemetry: 'مستنيين قراءة من الحساس',
    irrigationRecommended: 'الأرض محتاجة ري',
    aboveThreshold: 'رطوبة الأرض تمام، مفيش داعي للري دلوقتي',
    irrigationControl: 'التحكم في الري',
    commandQueuedOffline: 'الأمر اتسجّل — بس الحساس مش متصل دلوقتي.',
    executionCannotConfirm: 'مش هنقدر نأكد التنفيذ غير لما الحساس يرجع يتصل.',
    startIrrigation: 'ابدأ الري',
    stopIrrigation: 'وقف الري',
    todaysUsage: 'المياه المستخدمة النهاردة',
    physicalState: 'حالة المحبس فعليًا',
    requestedState: 'الحالة المطلوبة',
    valveConfirmedOpen: 'المحبس مفتوح فعلاً',
    valveConfirmedClosed: 'المحبس مقفول فعلاً',
    physicalStateUnknown: 'مش عارفين حالة المحبس دلوقتي',
    waitingForDeviceConfirmation: 'مستنيين تأكيد من الحساس',
    commandNotYetConfirmed: 'الأمر لسه ماتأكّدش',
    emergencyStopAll: 'وقف طوارئ لكل المحابس',
    confirmStartTitle: 'تأكيد: عايز تبدأ الري؟',
    confirmStartLabel: 'ابدأ الري',
    confirmStopTitle: 'تأكيد: توقف الري في كل المحابس؟',
    confirmStopLabel: 'وقف طوارئ',
    confirmValve: 'المحبس',
    confirmMoisture: 'رطوبة الأرض',
    unknownStateWarning: 'مش عارفين حالة المحبس دلوقتي — الحساس لسه ما أكّدش حالته.',
    emergencyStopBody: 'هيتبعت أمر لكل محبس في الأرض عشان يقفل فورًا. التأكيد الفعلي لسه بيعتمد على رد كل حساس.',
  },
  devices: {
    title: 'الحساسات ({{count}})',
    noDevicesYet: 'لسه مفيش حساسات',
    noDeviceSelected: 'اختار حساس',
    searchPlaceholder: 'دوّر على حساس…',
    soilMoisture: 'رطوبة الأرض',
    tabTelemetry: 'قراءات الحساس',
    device: 'الحساس',
    lastSeen: 'آخر ظهور من {{time}} · {{id}}',
  },
  settings: {
    languageSub: 'اختار طريقة كلام AgriSmart معاك.',
  },
  voice: {
    subtitle: 'قول أمر الري بالمصري.',
    heard: 'سمعنا: «{{text}}»',
    notRecognized: 'معرفتش ده أمر ري ولا لأ.',
    commandSent: 'اتبعت أمر الري.',
    commandFailedOffline: 'ما اتنفذش: الحساس مش متصل.',
    statusQuery: 'رطوبة الأرض {{pct}}%.',
  },
  common: {
    offline: 'مش متصل',
  },
};

export default arEg;
