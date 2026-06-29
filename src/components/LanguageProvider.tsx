import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'vi' | 'en';

type Dictionary = typeof translationDict.en;

const translationDict = {
  en: {
    // Brand & Title
    appTitle: "High-Performance Hex Editor & Binary Analyzer",
    appSubTitle: "Interactive web-based toolkit for hex editing, structure mapping, and deep binary stream analysis.",
    
    // Auth Page
    welcomeBack: "Welcome Back",
    authDesc: "Access your cloud binary workspace, sync analysis history, and unlock advanced deep editing features.",
    emailAddress: "Email Address",
    password: "Password",
    forgotPassword: "Forgot password?",
    loginButton: "Sign In",
    registerButton: "Create Account",
    orContinueWith: "Or continue with",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    termsText: "By signing in, you agree to our Terms of Service & Privacy Policy.",
    adminRoleCheckbox: "Register as Administrator account",
    guestMode: "Continue as Guest (No Cloud Save)",
    networkError: "Network connection error. Please check your internet connection.",
    popupBlocked: "Browser blocked the popup window. Please allow popups for this site.",
    popupClosed: "Login window was closed before completion.",
    authFailed: "Authentication failed. Please try again.",

    // Dashboard
    recentFiles: "Recent Analyses",
    noRecentFiles: "No files analyzed yet. Upload a binary file to start!",
    perfTitle: "System Engine Metrics",
    browserRam: "Browser RAM",
    allocatedMemory: "Allocated Stream Heap",
    fpsRate: "UI Render Target Rate",
    streamBuffer: "Stream Buffer Efficiency",
    uploadLimitText: "Supports binary files up to 2.5 GB with responsive stream chunking.",
    openFile: "Open Local File",
    openCloudFile: "Browse Cloud Files",
    myProfile: "My Profile",
    logoutConfirmTitle: "Are you sure you want to log out?",
    logoutConfirmDesc: "This will sign you out of your secure session. Any unsaved binary streams will remain only in local temporary memory.",
    cancel: "Cancel",
    confirm: "Confirm",

    // Profile Screen
    profileTitle: "User Account Profile",
    displayName: "Display Name",
    email: "Email",
    provider: "Auth Provider",
    joinDate: "Registration Date",
    accountID: "Account ID",
    roleLabel: "User Role",
    adminRole: "Administrator",
    userRole: "Member",
    cloudStorage: "Cloud Storage",
    unlimited: "Unlimited",
    saveSuccess: "Profile updated successfully!",
    saveError: "Failed to update profile!",
    emptyNameError: "Display name cannot be empty!",
    cloudSecurityTitle: "Secure Cloud Core Synchronized",
    cloudSecurityDesc: "Your account credentials and analysis histories are safely synced using military-grade Firebase Authentication and Firestore rules.",

    // Workspace Nav & Tab Headers
    tabOverview: "Overview",
    tabContent: "Content",
    tabMedia: "Media Assets",
    tabStrings: "ASCII Strings",
    tabMetadata: "EXIF/Metadata",
    tabStructure: "Structure Map",
    tabSearch: "Hex Search",
    tabSmartEdit: "Smart Patch",
    tabAdvancedHex: "Advanced Hex",
    tabBookmarks: "Bookmarks",
    tabByteScript: "ByteScripting",
    tabSignatures: "Signatures",

    // Workspace & Overview Tab
    fileSize: "File Size",
    fileEntropy: "File Entropy",
    sha256Hash: "SHA-256 Hash",
    md5Hash: "MD5 Hash",
    mimeType: "Inferred MIME Type",
    checksumCalculators: "Integrity & Checksums",
    exportFile: "Export Clean Binary",
    exportWithPatches: "Export Binary with Patches",
    unlockedAdvancedMsg: "Unlocked High-Performance Interactive Canvas Hex Editor!",
    binaryAnalysisSummary: "Binary Analysis Summary",
    structureMapping: "Structure Mapping",
    detectedSegments: "Detected Segments",
    patchesCount: "Active Patches",
    modifiedBytes: "Modified Bytes",
    originalBytes: "Original Bytes",

    // Smart Edit & Hex Search Tab
    searchPlaceHolderHex: "Search hex pattern (e.g. 89 50 4E 47)",
    searchPlaceHolderAscii: "Search text string (e.g. PNG, JFIF)",
    replaceLabel: "Replace Target Offset",
    replaceButton: "Apply Offset Patch",
    saveTextChange: "Save text modifications",
    replacementFile: "Upload Replacement File",
    readingReplacementFile: "Reading replacement file content...",
    patchAppliedSuccess: "Patch applied successfully!",
    patchAppliedError: "Failed to apply patch!",
    saveSuccessBytes: "Successfully saved changes",
    textEncoding: "Text Encoding Mode",

    // Bottom Status bar
    statusIdle: "Engine Idle",
    statusAnalyzing: "Analyzing byte structures...",
    statusProcessing: "Patching stream chunks...",
    offsetLabel: "Offset",
    valLabel: "Val",
    selLabel: "Sel",
    patchesApplied: "Patches applied",
    
    // Notifications & Toasts
    noFileLoaded: "No file is currently loaded in workspace.",
    unsupportedFile: "This file type is not supported for full media preview.",
    processingSuccess: "Analysis completed successfully!",
    unlockedAdvancedHex: "Advanced Interactive Hex Canvas is now unlocked!",
  },
  vi: {
    // Brand & Title
    appTitle: "Bộ Chỉnh Sửa Hex & Phân Tích Nhị Phân Siêu Tốc",
    appSubTitle: "Bộ công cụ trực quan trên web dùng để chỉnh sửa hex, lập bản đồ cấu trúc tệp và phân tích sâu các luồng nhị phân.",
    
    // Auth Page
    welcomeBack: "Chào mừng trở lại",
    authDesc: "Truy cập không gian lưu trữ nhị phân đám mây của bạn, đồng bộ hóa lịch sử phân tích và mở khóa các tính năng chỉnh sửa nâng cao.",
    emailAddress: "Địa chỉ Email",
    password: "Mật khẩu",
    forgotPassword: "Quên mật khẩu?",
    loginButton: "Đăng Nhập",
    registerButton: "Tạo Tài Khoản",
    orContinueWith: "Hoặc tiếp tục bằng",
    noAccount: "Chưa có tài khoản?",
    hasAccount: "Đã có tài khoản rồi?",
    termsText: "Bằng cách đăng nhập, bạn đồng ý với Điều khoản Dịch vụ & Chính sách Bảo mật của chúng tôi.",
    adminRoleCheckbox: "Đăng ký với tài khoản Quản trị viên (Admin)",
    guestMode: "Tiếp tục chế độ Khách (Không lưu đám mây)",
    networkError: "Lỗi kết nối mạng. Vui lòng kiểm tra lại kết nối internet của bạn.",
    popupBlocked: "Trình duyệt đã chặn cửa sổ bật lên (popup). Vui lòng cấp quyền mở popup cho trang web này.",
    popupClosed: "Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất đăng nhập.",
    authFailed: "Đăng nhập thất bại. Vui lòng thử lại.",

    // Dashboard
    recentFiles: "Tệp phân tích gần đây",
    noRecentFiles: "Chưa có tệp nào được phân tích. Hãy tải lên tệp tin để bắt đầu!",
    perfTitle: "Thông số Động cơ Hệ thống",
    browserRam: "RAM Trình duyệt",
    allocatedMemory: "Bộ nhớ Phân bổ Luồng",
    fpsRate: "Tốc độ dựng hình UI",
    streamBuffer: "Hiệu năng Stream Buffer",
    uploadLimitText: "Hỗ trợ các tệp tin nhị phân lớn lên tới 2.5 GB với cơ chế phân nhỏ luồng tối ưu.",
    openFile: "Mở Tệp Cục Bộ",
    openCloudFile: "Duyệt Tệp Đám Mây",
    myProfile: "Hồ Sơ Của Tôi",
    logoutConfirmTitle: "Bạn có chắc chắn muốn đăng xuất?",
    logoutConfirmDesc: "Hành động này sẽ thoát phiên làm việc an toàn của bạn. Mọi luồng nhị phân chưa lưu sẽ chỉ còn trong bộ nhớ tạm cục bộ.",
    cancel: "Hủy bỏ",
    confirm: "Xác nhận",

    // Profile Screen
    profileTitle: "Hồ Sơ Tài Khoản Người Dùng",
    displayName: "Tên hiển thị",
    email: "Email",
    provider: "Nhà cung cấp liên kết",
    joinDate: "Ngày đăng ký",
    accountID: "Mã tài khoản",
    roleLabel: "Quyền hạn",
    adminRole: "Quản trị viên",
    userRole: "Thành viên",
    cloudStorage: "Lưu trữ đám mây",
    unlimited: "Không giới hạn",
    saveSuccess: "Cập nhật hồ sơ thành công!",
    saveError: "Lỗi khi cập nhật hồ sơ!",
    emptyNameError: "Tên hiển thị không được bỏ trống!",
    cloudSecurityTitle: "Hệ thống Đám mây Bảo mật Cao",
    cloudSecurityDesc: "Thông tin đăng nhập và lịch sử phân tích của bạn được đồng bộ hóa và bảo vệ an toàn bằng Firebase Authentication và các quy tắc Firestore bảo mật tối ưu.",

    // Workspace Nav & Tab Headers
    tabOverview: "Tổng Quan",
    tabContent: "Nội Dung",
    tabMedia: "Tài Nguyên Media",
    tabStrings: "Chuỗi ASCII",
    tabMetadata: "EXIF/Metadata",
    tabStructure: "Sơ Đồ Cấu Trúc",
    tabSearch: "Tìm Kiếm Hex",
    tabSmartEdit: "Vá Thông Minh",
    tabAdvancedHex: "Hex Nâng Cao",
    tabBookmarks: "Đánh dấu",
    tabByteScript: "Kịch bản ByteScript",
    tabSignatures: "Chữ ký số",

    // Workspace & Overview Tab
    fileSize: "Kích Thước Tệp",
    fileEntropy: "Entropy của Tệp",
    sha256Hash: "Mã băm SHA-256",
    md5Hash: "Mã băm MD5",
    mimeType: "Kiểu tệp (MIME Type)",
    checksumCalculators: "Độ Toàn Vẹn & Mã Kiểm Tra",
    exportFile: "Xuất Bản Nhị Phân Sạch",
    exportWithPatches: "Xuất Bản Nhị Phân Đã Vá",
    unlockedAdvancedMsg: "Đã mở khóa trình chỉnh sửa Hex Canvas tương tác hiệu suất cao!",
    binaryAnalysisSummary: "Tóm Tắt Phân Tích Nhị Phân",
    structureMapping: "Bản Đồ Cấu Trúc",
    detectedSegments: "Phân vùng phát hiện",
    patchesCount: "Bản vá đang hoạt động",
    modifiedBytes: "Số bytes thay đổi",
    originalBytes: "Số bytes nguyên bản",

    // Smart Edit & Hex Search Tab
    searchPlaceHolderHex: "Tìm kiếm mẫu hex (ví dụ: 89 50 4E 47)",
    searchPlaceHolderAscii: "Tìm kiếm chuỗi văn bản (ví dụ: PNG, JFIF)",
    replaceLabel: "Thay Thế Tại Vị Trí Offset",
    replaceButton: "Áp Dụng Bản Vá Offset",
    saveTextChange: "Lưu thay đổi văn bản",
    replacementFile: "Tải Lên Tệp Tin Thay Thế",
    readingReplacementFile: "Đang đọc nội dung tệp tin thay thế...",
    patchAppliedSuccess: "Áp dụng bản vá thành công!",
    patchAppliedError: "Lỗi khi áp dụng bản vá!",
    saveSuccessBytes: "Đã lưu thay đổi thành công",
    textEncoding: "Chế Độ Mã Hóa Văn Bản",

    // Bottom Status bar
    statusIdle: "Động cơ đang nghỉ",
    statusAnalyzing: "Đang phân tích cấu trúc byte...",
    statusProcessing: "Đang xử lý phân mảnh luồng...",
    offsetLabel: "Offset",
    valLabel: "Giá trị",
    selLabel: "Chọn",
    patchesApplied: "Bản vá đã áp dụng",
    
    // Notifications & Toasts
    noFileLoaded: "Hiện chưa có tệp tin nào được tải vào không gian làm việc.",
    unsupportedFile: "Định dạng tệp tin này không hỗ trợ xem trước đa phương tiện trực tiếp.",
    processingSuccess: "Phân tích cấu trúc hoàn tất thành công!",
    unlockedAdvancedHex: "Trình biên tập Hex tương tác đã được kích hoạt thành công!",
  }
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Dictionary) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Detect default system/browser language, otherwise default to English
  const getInitialLanguage = (): Language => {
    const saved = localStorage.getItem('app_lang');
    if (saved === 'vi' || saved === 'en') return saved;
    
    const browserLang = navigator.language || '';
    if (browserLang.toLowerCase().startsWith('vi')) {
      return 'vi';
    }
    return 'en';
  };

  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('app_lang', lang);
  };

  const t = (key: keyof Dictionary): string => {
    const dict = translationDict[language];
    return dict[key] || translationDict.en[key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
