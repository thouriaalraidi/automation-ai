
/**
 * Automation AI
 * واجهة المحادثات والمشاريع
 *
 * الميزات:
 * - فصل البيانات حسب حساب Google
 * - إنشاء وإدارة المحادثات والمشاريع
 * - البحث والتثبيت والأرشفة والاسترجاع
 * - تعديل الرسائل مع الاحتفاظ بالمحادثة الأصلية
 * - مشاركة المحتوى وتصديره
 * - استعادة المحادثات القديمة اختياريًا
 * - دعم الهاتف والوضع الداكن
 *
 * ملاحظة:
 * المحادثات محفوظة محليًا في المتصفح، وليست في Neon.
 */

(() => {
  "use strict";

  // ==========================================
  // عناصر الواجهة
  // ==========================================

  const $ = id => document.getElementById(id);

  const ui = {
    shell: $("appShell"),
    sidebar: $("sidebar"),
    backdrop: $("sidebarBackdrop"),
    list: $("chatList"),
    search: $("searchInput"),
    messages: $("messages"),
    title: $("currentChatTitle"),
    question: $("question"),
    send: $("sendButton"),
    form: $("chatForm"),
    themeLabel: $("themeLabel")
  };

  if (Object.values(ui).some(element => !element)) {
    console.error("Automation AI: Missing HTML elements.");
    return;
  }

  // ==========================================
  // هوية الحساب المسجل
  // ==========================================

  const ACCOUNT_ID =
    typeof window.AUTOMATION_USER_ID === "string"
      ? window.AUTOMATION_USER_ID.trim()
      : "";

  if (!ACCOUNT_ID) {
    window.location.replace("/login");
    return;
  }

  // مفاتيح تخزين مستقلة لكل حساب
  const CHAT_KEY = `automationChats:${ACCOUNT_ID}`;
  const PROJECT_KEY = `automationProjects:${ACCOUNT_ID}`;
  const HISTORY_KEY = `chatHistory:${ACCOUNT_ID}`;

  const MIGRATION_KEY =
    `automation:${ACCOUNT_ID}:legacyPromptSeen`;

  // المفاتيح المستخدمة قبل إضافة تسجيل الدخول
  const LEGACY_KEYS = {
    chats: "automationChats",
    projects: "automationProjects",
    history: "chatHistory"
  };

  const ERROR_REPLY = "حدث خطأ أثناء الاتصال بـ Gemini.";

  const now = () => Date.now();

  const createId = () =>
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const shorten = (text, max = 38) => {
    const value = String(text ?? "").trim();
    return value.slice(0, max) +
      (value.length > max ? "…" : "");
  };

  // ==========================================
  // إدارة التخزين المحلي
  // ==========================================

  function readArray(key) {
    try {
      const data = JSON.parse(
        localStorage.getItem(key) || "[]"
      );

      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn("Storage read failed:", key, error);
      return [];
    }
  }

  function writeArray(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("Storage write failed:", key, error);

      alert(
        "تعذر حفظ البيانات. صدّري نسخة احتياطية " +
        "وتحققي من مساحة تخزين المتصفح."
      );

      return false;
    }
  }

  function validChat(chat) {
    return Boolean(
      chat &&
      typeof chat.id === "string" &&
      Array.isArray(chat.history) &&
      chat.history.length > 0
    );
  }

  function validProjectData(project) {
    return Boolean(
      project &&
      typeof project.id === "string" &&
      typeof project.name === "string"
    );
  }

  let chats = readArray(CHAT_KEY).filter(validChat);

  let projects = readArray(PROJECT_KEY)
    .filter(validProjectData);

  // دعم سجل المحادثة القديم داخل الحساب نفسه
  if (chats.length === 0) {
    const history = readArray(HISTORY_KEY);

    if (history.length) {
      const first = history.find(item =>
        item.role === "user"
      );

      chats = [{
        id: createId(),
        title: first
          ? shorten(first.text)
          : "محادثة سابقة",
        history,
        createdAt: now(),
        updatedAt: now()
      }];
    }
  }

  function saveChats() {
    return writeArray(CHAT_KEY, chats);
  }

  function saveProjects() {
    return writeArray(PROJECT_KEY, projects);
  }

  // ==========================================
  // حالة التطبيق
  // ==========================================

  let activeChatId = null;
  let selectedProjectId = null;
  let screen = "new";
  let search = "";
  let busy = false;
  let activeMenu = null;

  const expandedProjects = new Set();

  function findChat(chatId) {
    return chats.find(chat => chat.id === chatId) || null;
  }

  function findProject(projectId) {
    return projects.find(project =>
      project.id === projectId
    ) || null;
  }

  function currentChat() {
    return findChat(activeChatId);
  }

  function validProject(projectId) {
    const project = findProject(projectId);
    return project && !project.isArchived ? project : null;
  }

  function usableChat(chat) {
    return Boolean(
      chat &&
      Array.isArray(chat.history) &&
      chat.history.length > 0 &&
      !chat.isArchived &&
      !findProject(chat.projectId)?.isArchived
    );
  }

  // ==========================================
  // إنشاء عناصر HTML
  // ==========================================

  function el(tag, className = "", text) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;

    return element;
  }

  // ==========================================
  // الأيقونات الخطية
  // ==========================================

  const icons = {
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    "square-pen": '<path d="M12 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/><path d="m15 6 3 3-8 8-4 1 1-4 8-8a2 2 0 0 1 3 0Z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "folder-open": '<path d="M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v3"/><path d="M4 20h15l3-9H7z"/>',
    message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    pin: '<path d="m16 3 5 5-3 1-3 3 1 5-1 1-4-4-5 5-1-1 5-5-4-4 1-1 5 1 3-3z"/>',
    edit: '<path d="M12 20H4v-8L16 3a2.8 2.8 0 0 1 4 4L9 18l-5 2"/>',
    archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M10 12h4"/>',
    restore: '<path d="M3 12a9 9 0 1 0 2-6.5L3 8"/><path d="M3 3v5h5"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5"/><path d="M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m10 2-1 3-3 1-3-1-2 4 3 2v3l-3 2 2 4 3-1 3 1 1 3h4l1-3 3-1 3 1 2-4-3-2v-3l3-2-2-4-3 1-3-1-1-3z"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    "arrow-up": '<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
    moon: '<path d="M20 15.3A8.8 8.8 0 0 1 8.7 4 9 9 0 1 0 20 15.3Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
    apps: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    puzzle: '<path d="M20 13v5a2 2 0 0 1-2 2h-5v-2a2 2 0 1 0-4 0v2H6a2 2 0 0 1-2-2v-5h2a2 2 0 1 0 0-4H4V6a2 2 0 0 1 2-2h3v2a2 2 0 1 0 4 0V4h5a2 2 0 0 1 2 2v3h-2a2 2 0 1 0 0 4z"/>'
  };

  function icon(name) {
    const svg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );

    const attributes = {
      viewBox: "0 0 24 24",
      width: "18",
      height: "18",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.7",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true"
    };

    Object.entries(attributes).forEach(([key, value]) => {
      svg.setAttribute(key, value);
    });

    svg.innerHTML = icons[name] || icons.message;
    return svg;
  }

  function button(
    label,
    iconName,
    onClick,
    className = "icon-button"
  ) {
    const element = el("button", className);

    element.type = "button";
    element.title = label;
    element.setAttribute("aria-label", label);

    if (iconName) element.append(icon(iconName));

    if (onClick) {
      element.addEventListener("click", onClick);
    }

    return element;
  }

  function labeledButton(
    text,
    iconName,
    onClick,
    className = ""
  ) {
    const element = button(
      text,
      iconName,
      onClick,
      className
    );

    element.append(el("span", "", text));
    return element;
  }

  function decorateIcons() {
    document.querySelectorAll("[data-icon]").forEach(element => {
      element.replaceChildren(
        icon(element.dataset.icon)
      );
    });
  }
// ==========================================
// إدارة الوضع الفاتح والداكن
// ==========================================

function setTheme(theme) {
    const isDark = theme === "dark";

    // تطبيق المظهر فورًا
    document.body.classList.toggle("dark-theme", isDark);
    document.documentElement.style.colorScheme = isDark
        ? "dark"
        : "light";

    // حفظ اختيار المستخدم
    localStorage.setItem("theme", isDark ? "dark" : "light");

    // تحديث عنوان زر المظهر
    ui.themeLabel.textContent = isDark
        ? "الوضع الفاتح"
        : "الوضع الداكن";

    // تحديث الأيقونات بدون إعادة تحميل الصفحة
    const iconName = isDark ? "sun" : "moon";

    ["themeButton", "railTheme"].forEach(id => {
        const button = $(id);
        const currentIcon = button?.querySelector("svg");

        if (currentIcon) {
            currentIcon.replaceWith(icon(iconName));
        }
    });
}

// تبديل المظهر عند الضغط
function toggleTheme() {
    const currentTheme = document.body.classList.contains("dark-theme")
        ? "dark"
        : "light";

    setTheme(currentTheme === "dark" ? "light" : "dark");
}
  // ==========================================
  // الشريط الجانبي
  // ==========================================

  function showSidebar() {
    if (window.innerWidth <= 760) {
      ui.shell.classList.add("sidebar-open");
      ui.backdrop.hidden = false;
    } else {
      ui.shell.classList.remove("sidebar-collapsed");
    }
  }

  function hideMobileSidebar() {
    ui.shell.classList.remove("sidebar-open");
    ui.backdrop.hidden = true;
  }

  function toggleSidebar() {
    if (window.innerWidth <= 760) {
      ui.shell.classList.contains("sidebar-open")
        ? hideMobileSidebar()
        : showSidebar();
    } else {
      ui.shell.classList.toggle("sidebar-collapsed");
    }
  }

  // ==========================================
  // قائمة الخيارات
  // ==========================================

  function closeMenu() {
    activeMenu?.remove();
    activeMenu = null;
  }

  function openMenu(anchor, options) {
    closeMenu();

    const panel = el("div", "context-menu");
    panel.setAttribute("role", "menu");

    for (const item of options) {
      if (item.separator) {
        panel.append(el("div", "menu-divider"));
        continue;
      }

      const option = labeledButton(
        item.label,
        item.icon,
        () => {
          closeMenu();
          if (!busy) item.action();
        },
        `menu-item${item.danger ? " danger" : ""}`
      );

      option.setAttribute("role", "menuitem");
      panel.append(option);
    }

    document.body.append(panel);

    const rect = anchor.getBoundingClientRect();

    const left = Math.max(
      8,
      Math.min(
        rect.left - panel.offsetWidth + 28,
        innerWidth - panel.offsetWidth - 8
      )
    );

    const top = Math.max(
      8,
      Math.min(
        rect.top,
        innerHeight - panel.offsetHeight - 8
      )
    );

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    activeMenu = panel;
  }

  document.addEventListener("click", event => {
    if (
      activeMenu &&
      !activeMenu.contains(event.target) &&
      !event.target.closest(".side-control")
    ) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });

  ui.list.addEventListener(
    "scroll",
    closeMenu,
    { passive: true }
  );

  // ==========================================
  // النوافذ المنبثقة
  // ==========================================

  function dialog(title) {
    const box = el("dialog", "app-dialog");
    const header = el("div", "dialog-header");
    const heading = el("h2", "", title);

    const close = button(
      "إغلاق النافذة",
      "close",
      () => box.close(),
      "dialog-close"
    );

    header.append(heading, close);
    box.append(header);

    document.body.append(box);

    box.addEventListener(
      "close",
      () => box.remove(),
      { once: true }
    );

    box.showModal();
    return box;
  }

  function labeledField(
    title,
    value = "",
    multiline = false
  ) {
    const label = el("label", "dialog-field");
    const caption = el("span", "dialog-field-label", title);

    const control = el(
      multiline ? "textarea" : "input",
      "dialog-field-control"
    );

    if (multiline) {
      control.rows = 3;
    } else {
      control.type = "text";
    }

    control.value = String(value ?? "");

    label.append(caption, control);

    return { label, control };
  }

  function dialogActions(
    box,
    onSave,
    saveLabel = "حفظ"
  ) {
    const actions = el("div", "dialog-actions");

    const cancel = labeledButton(
      "إلغاء",
      null,
      () => box.close(),
      "action-button"
    );

    const save = labeledButton(
      saveLabel,
      null,
      onSave,
      "action-button"
    );

    actions.append(cancel, save);
    box.append(actions);

    return { cancel, save };
  }

  // ==========================================
  // نسخ النصوص وتصديرها
  // ==========================================

  async function copyText(text, target) {
    try {
      await navigator.clipboard.writeText(String(text));

      if (target) {
        const label = target.querySelector("span");

        if (label) {
          const previous = label.textContent;
          label.textContent = "تم النسخ";

          setTimeout(() => {
            if (label.isConnected) {
              label.textContent = previous;
            }
          }, 1800);
        }
      }
    } catch (error) {
      console.error("Copy failed:", error);
      alert("تعذر النسخ. جرّبي تصدير الملف.");
    }
  }

  function fileDownload(
    filename,
    content,
    type = "text/plain;charset=utf-8"
  ) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);

    const link = el("a");
    link.href = url;
    link.download = filename;

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function transcript(chat) {
    const title = chat.title || "محادثة";

    const messages = (chat.history || []).map(item => {
      const label = item.role === "user"
        ? "السؤال"
        : "الإجابة";

      return `${label}:\n${item.text || ""}`;
    });

    return `${title}\n\n${messages.join("\n\n---\n\n")}`;
  }

  function share(item, kind) {
    const group = kind === "project"
      ? chats.filter(chat => chat.projectId === item.id)
      : [item];

    const text = group.map(transcript).join(
      "\n\n==========\n\n"
    );

    const box = dialog(
      kind === "project"
        ? "مشاركة المشروع"
        : "مشاركة المحادثة"
    );

    box.append(el(
      "p",
      "",
      "يمكنك نسخ المحتوى أو تنزيله. " +
      "المشاركة هنا محلية وليست رابطًا عامًا."
    ));

    const actions = el("div", "dialog-actions");

    actions.append(
      labeledButton(
        "نسخ",
        "copy",
        () => copyText(text),
        "action-button"
      ),

      labeledButton(
        "TXT",
        "download",
        () => fileDownload(
          "automation-export.txt",
          text
        ),
        "action-button"
      ),

      labeledButton(
        "JSON",
        "download",
        () => fileDownload(
          "automation-export.json",
          JSON.stringify(
            kind === "project"
              ? { project: item, chats: group }
              : { chat: item },
            null,
            2
          ),
          "application/json"
        ),
        "action-button"
      )
    );

    box.append(actions);
  }

  function backupAll() {
    const backup = {
      exportedAt: new Date().toISOString(),
      accountScoped: true,
      automationChats: readArray(CHAT_KEY),
      automationProjects: readArray(PROJECT_KEY),
      chatHistory: readArray(HISTORY_KEY)
    };

    fileDownload(
      "automation-backup.json",
      JSON.stringify(backup, null, 2),
      "application/json"
    );
  }

  // ==========================================
  // استعادة المحادثات القديمة
  // ==========================================

  function canImportLegacy() {
    if (window.AUTOMATION_IS_ADMIN !== true) {
      return false;
    }

    return Boolean(
      readArray(LEGACY_KEYS.chats).some(validChat) ||
      readArray(LEGACY_KEYS.projects).some(validProjectData) ||
      readArray(LEGACY_KEYS.history).length
    );
  }

  function importLegacyData() {
    if (!canImportLegacy()) return;

    const oldChats = readArray(LEGACY_KEYS.chats)
      .filter(validChat);

    const oldProjects = readArray(LEGACY_KEYS.projects)
      .filter(validProjectData);

    const oldHistory = readArray(LEGACY_KEYS.history);

    const chatIds = new Set(chats.map(chat => chat.id));
    const projectIds = new Set(
      projects.map(project => project.id)
    );

    const projectIdMap = new Map();
    const addedChats = [];
    const addedProjects = [];

    // نسخ المشاريع بدون الكتابة فوق مشاريع الحساب
    for (const project of oldProjects) {
      const copy = { ...project };

      if (projectIds.has(copy.id)) {
        const existing = projects.find(item =>
          item.id === copy.id
        );

        if (JSON.stringify(existing) === JSON.stringify(copy)) {
          projectIdMap.set(project.id, copy.id);
          continue;
        }

        copy.id = createId();
      }

      projectIds.add(copy.id);
      projectIdMap.set(project.id, copy.id);
      addedProjects.push(copy);
    }

    // نسخ المحادثات مع الاحتفاظ بمعرفات مشاريعها
    for (const chat of oldChats) {
      if (chatIds.has(chat.id)) continue;

      const copy = { ...chat };

      if (
        copy.projectId &&
        projectIdMap.has(copy.projectId)
      ) {
        copy.projectId = projectIdMap.get(copy.projectId);
      }

      chatIds.add(copy.id);
      addedChats.push(copy);
    }

    // دعم نظام chatHistory الأقدم
    if (
      oldChats.length === 0 &&
      oldHistory.length > 0
    ) {
      const legacyId = "automation-legacy-chatHistory";

      if (!chatIds.has(legacyId)) {
        const first = oldHistory.find(item =>
          item.role === "user"
        );

        addedChats.push({
          id: legacyId,
          title: first
            ? shorten(first.text)
            : "محادثة سابقة",
          history: oldHistory,
          createdAt: now(),
          updatedAt: now()
        });
      }
    }

    if (
      addedChats.length === 0 &&
      addedProjects.length === 0
    ) {
      alert("هذه البيانات موجودة بالفعل في حسابك.");
      return;
    }

    const mergedChats = [...addedChats, ...chats];
    const mergedProjects = [...addedProjects, ...projects];

    // الاحتفاظ بنسخة المفاتيح القديمة دون حذف
    if (!writeArray(PROJECT_KEY, mergedProjects)) return;
    if (!writeArray(CHAT_KEY, mergedChats)) return;

    projects = mergedProjects;
    chats = mergedChats;

    renderSidebar();

    alert(
      `تم نسخ ${addedChats.length} محادثة و` +
      `${addedProjects.length} مشروع دون حذف البيانات القديمة.`
    );
  }

  function openLegacyImportDialog() {
    if (!canImportLegacy()) {
      alert("لا توجد محادثات قديمة قابلة للاستعادة.");
      return;
    }

    const box = dialog("استعادة المحادثات القديمة");

    box.append(el(
      "p",
      "",
      "هذه بيانات محفوظة قبل إضافة تسجيل الدخول. " +
      "استورديها فقط إذا كانت تخصك أنتِ. " +
      "سننسخها لحسابك دون حذف الأصل."
    ));

    dialogActions(
      box,
      () => {
        if (!confirm(
          "هل أنتِ متأكدة أن المحادثات القديمة تخصك؟"
        )) return;

        box.close();
        importLegacyData();
      },
      "نسخ المحادثات إلى حسابي"
    );
  }

  function offerLegacyImportOnce() {
    if (
      !canImportLegacy() ||
      chats.length ||
      projects.length ||
      localStorage.getItem(MIGRATION_KEY) === "1"
    ) {
      return;
    }

    try {
      localStorage.setItem(MIGRATION_KEY, "1");
    } catch (error) {
      console.warn("Migration flag was not saved.", error);
    }

    openLegacyImportDialog();
  }

  // ==========================================
  // إعدادات المشاريع
  // ==========================================

  function projectSettings(project) {
    const box = dialog("إعدادات المشروع");

    const name = labeledField(
      "اسم المشروع",
      project.name
    );

    const description = labeledField(
      "الوصف",
      project.description || "",
      true
    );

    const notes = labeledField(
      "ملاحظات خاصة بالمشروع",
      project.notes || "",
      true
    );

    box.append(
      name.label,
      description.label,
      notes.label,
      el(
        "p",
        "",
        "هذه الملاحظات للتنظيم فقط " +
        "ولا تُرسل تلقائيًا إلى Gemini."
      )
    );

    dialogActions(box, () => {
      const value = name.control.value.trim();

      if (!value) {
        alert("اكتبي اسم المشروع.");
        return;
      }

      const duplicate = projects.some(item =>
        item.id !== project.id &&
        item.name.toLowerCase() === value.toLowerCase()
      );

      if (duplicate) {
        alert("يوجد مشروع بنفس الاسم.");
        return;
      }

      project.name = value;
      project.description =
        description.control.value.trim();

      project.notes =
        notes.control.value.trim();

      saveProjects();
      box.close();
      renderSidebar();

      if (
        screen === "project" &&
        selectedProjectId === project.id
      ) {
        showProjectHome(project);
      }
    });

    name.control.focus();
  }

  // ==========================================
  // إنشاء مشروع جديد
  // ==========================================

  function createProject() {
    if (busy) return;

    const box = dialog("مشروع جديد");
    const field = labeledField("اسم المشروع");

    box.append(field.label);

    dialogActions(
      box,
      () => {
        const name = field.control.value.trim();

        if (!name) {
          alert("اكتبي اسم المشروع.");
          return;
        }

        if (projects.some(project =>
          project.name.toLowerCase() === name.toLowerCase()
        )) {
          alert("هذا الاسم مستخدم.");
          return;
        }

        const project = {
          id: createId(),
          name,
          isPinned: false,
          isArchived: false
        };

        projects.unshift(project);
        saveProjects();

        expandedProjects.add(project.id);

        box.close();
        showProjectHome(project);
      },
      "إنشاء المشروع"
    );

    field.control.focus();
  }

  function deleteProject(project) {
    const confirmed = confirm(
      `حذف مشروع «${project.name}»؟\n` +
      "ستبقى محادثاته محفوظة خارج المشروع."
    );

    if (!confirmed) return;

    projects = projects.filter(item =>
      item.id !== project.id
    );

    chats.forEach(chat => {
      if (chat.projectId === project.id) {
        delete chat.projectId;
      }
    });

    saveProjects();
    saveChats();

    expandedProjects.delete(project.id);

    const viewingProject =
      screen === "project" &&
      selectedProjectId === project.id;

    if (selectedProjectId === project.id) {
      selectedProjectId = null;
    }

    if (viewingProject) {
      createNewChat();
    } else {
      renderSidebar();
    }
  }

  // ==========================================
  // تغيير عنوان المحادثة
  // ==========================================

  function renameChat(chat) {
    const box = dialog("تغيير اسم المحادثة");

    const field = labeledField(
      "عنوان المحادثة",
      chat.title
    );

    box.append(field.label);

    dialogActions(box, () => {
      const title = field.control.value.trim();

      if (!title) {
        alert("اكتبي اسمًا للمحادثة.");
        return;
      }

      chat.title = title;
      saveChats();

      box.close();
      renderSidebar();

      if (chat.id === activeChatId) {
        ui.title.textContent = title;
      }
    });

    field.control.focus();
  }

  function deleteChat(chat) {
    if (!confirm(
      `حذف المحادثة «${chat.title}» نهائيًا؟`
    )) return;

    chats = chats.filter(item =>
      item.id !== chat.id
    );

    saveChats();

    if (activeChatId === chat.id) {
      createNewChat();
    } else {
      renderSidebar();
    }
  }

  // ==========================================
  // نقل المحادثات بين المشاريع
  // ==========================================

  function moveChat(chat) {
    const box = dialog("نقل إلى مشروع");
    const label = el("label", "", "اختاري المشروع");
    const select = el("select");

    const empty = el(
      "option",
      "",
      "المحادثات الأخيرة (بدون مشروع)"
    );

    empty.value = "";
    select.append(empty);

    for (const project of projects.filter(item =>
      !item.isArchived
    )) {
      const option = el("option", "", project.name);
      option.value = project.id;
      select.append(option);
    }

    select.value = validProject(chat.projectId)?.id || "";

    label.append(select);
    box.append(label);

    dialogActions(
      box,
      () => {
        const project = validProject(select.value);

        if (project) {
          chat.projectId = project.id;
          expandedProjects.add(project.id);
        } else {
          delete chat.projectId;
        }

        if (activeChatId === chat.id) {
          selectedProjectId = project?.id || null;
        }

        saveChats();
        box.close();
        renderSidebar();
      },
      "نقل"
    );
  }

  // ==========================================
  // الأرشيف
  // ==========================================

  function archiveViewer() {
    const box = dialog("الأرشيف");
    const content = el("div");

    box.append(content);

    function redraw() {
      content.replaceChildren();

      const archivedProjects = projects.filter(
        project => project.isArchived
      );

      const archivedChats = chats.filter(
        chat => chat.isArchived
      );

      if (
        !archivedProjects.length &&
        !archivedChats.length
      ) {
        content.append(el("p", "", "الأرشيف فارغ."));
        return;
      }

      for (const project of archivedProjects) {
        const row = el("div", "archive-row");

        row.append(
          icon("folder"),
          el("span", "", project.name),

          labeledButton(
            "استرجاع",
            "restore",
            () => {
              project.isArchived = false;
              saveProjects();
              renderSidebar();
              redraw();
            }
          )
        );

        content.append(row);
      }

      for (const chat of archivedChats) {
        const row = el("div", "archive-row");

        row.append(
          icon("message"),
          el("span", "", chat.title),

          labeledButton(
            "استرجاع",
            "restore",
            () => {
              chat.isArchived = false;
              saveChats();
              renderSidebar();
              redraw();
            }
          )
        );

        content.append(row);
      }
    }

    redraw();
  }

  // ==========================================
  // خيارات المحادثات
  // ==========================================

  function chatMenu(chat, anchor) {
    openMenu(anchor, [
      {
        label: "تغيير الاسم",
        icon: "edit",
        action: () => renameChat(chat)
      },
      {
        label: chat.isPinned
          ? "إلغاء التثبيت"
          : "تثبيت المحادثة",
        icon: "pin",
        action: () => {
          chat.isPinned = !chat.isPinned;
          saveChats();
          renderSidebar();
        }
      },
      {
        label: "نقل إلى مشروع",
        icon: "folder",
        action: () => moveChat(chat)
      },
      {
        label: "مشاركة / تصدير",
        icon: "share",
        action: () => share(chat, "chat")
      },
      {
        label: "أرشفة",
        icon: "archive",
        action: () => {
          chat.isArchived = true;
          saveChats();

          if (activeChatId === chat.id) {
            createNewChat();
          } else {
            renderSidebar();
          }
        }
      },
      { separator: true },
      {
        label: "حذف المحادثة",
        icon: "trash",
        danger: true,
        action: () => deleteChat(chat)
      }
    ]);
  }

  // ==========================================
  // خيارات المشاريع
  // ==========================================

  function projectMenu(project, anchor) {
    openMenu(anchor, [
      {
        label: "الصفحة الرئيسية",
        icon: "folder-open",
        action: () => showProjectHome(project)
      },
      {
        label: "تغيير الاسم / الإعدادات",
        icon: "settings",
        action: () => projectSettings(project)
      },
      {
        label: "مشاركة / تصدير",
        icon: "share",
        action: () => share(project, "project")
      },
      {
        label: project.isPinned
          ? "إلغاء التثبيت"
          : "تثبيت المشروع",
        icon: "pin",
        action: () => {
          project.isPinned = !project.isPinned;
          saveProjects();
          renderSidebar();
        }
      },
      {
        label: "أرشفة المشروع",
        icon: "archive",
        action: () => {
          project.isArchived = true;
          saveProjects();

          if (selectedProjectId === project.id) {
            createNewChat();
          } else {
            renderSidebar();
          }
        }
      },
      { separator: true },
      {
        label: "حذف المشروع فقط",
        icon: "trash",
        danger: true,
        action: () => deleteProject(project)
      }
    ]);
  }

  // ==========================================
  // فتح المحادثات
  // ==========================================

  function openChat(chat) {
    if (busy || !usableChat(chat)) return;

    activeChatId = chat.id;

    selectedProjectId =
      validProject(chat.projectId)?.id || null;

    screen = "chat";

    if (selectedProjectId) {
      expandedProjects.add(selectedProjectId);
    }

    ui.title.textContent = chat.title;

    renderSidebar();
    renderHistory();
    hideMobileSidebar();
    ui.question.focus();
  }

  // ==========================================
  // محادثة جديدة دون حفظها فارغة
  // ==========================================

  function createNewChat(projectId = null) {
    if (busy) return;

    activeChatId = null;

    selectedProjectId =
      validProject(projectId)?.id || null;

    screen = "new";

    if (selectedProjectId) {
      expandedProjects.add(selectedProjectId);
    }

    ui.title.textContent = "محادثة جديدة";
    ui.question.value = "";

    autoResize();
    showWelcome();
    renderSidebar();
    hideMobileSidebar();
    ui.question.focus();
  }

  // ==========================================
  // الصفحة الرئيسية للمشروع
  // ==========================================

  function showProjectHome(project) {
    if (
      busy ||
      !validProject(project.id)
    ) return;

    screen = "project";
    activeChatId = null;
    selectedProjectId = project.id;

    expandedProjects.add(project.id);

    ui.title.textContent = project.name;

    const home = el("div", "welcome");

    home.append(
      el("div", "welcome-mark", "AI"),
      el("h2", "", project.name)
    );

    if (project.description) {
      home.append(el(
        "p",
        "",
        project.description
      ));
    }

    home.append(labeledButton(
      "محادثة جديدة داخل المشروع",
      "plus",
      () => createNewChat(project.id),
      "project-home-chat"
    ));

    const recent = el("div", "project-home-chats");

    chats
      .filter(chat =>
        chat.projectId === project.id &&
        usableChat(chat)
      )
      .forEach(chat => {
        recent.append(labeledButton(
          chat.title,
          "message",
          () => openChat(chat),
          "project-home-chat"
        ));
      });

    home.append(recent);

    ui.messages.replaceChildren(home);

    renderSidebar();
    hideMobileSidebar();
  }

  // ==========================================
  // شاشة الترحيب
  // ==========================================

  function showWelcome() {
    const welcome = el("div", "welcome");

    welcome.append(
      el("div", "welcome-mark", "AI"),
      el("h2", "", "مرحبًا بك في Automation AI"),
      el(
        "p",
        "",
        "مساعدك لتعلّم الأتمتة خطوة بخطوة، " +
        "باستخدام Python وAPIs وRPA."
      )
    );

    const suggestions = el("div", "suggestions");

    const questions = [
      "ما هي الأتمتة؟",
      "كيف أبدأ تعلم الأتمتة؟",
      "كيف أستخدم Python في الأتمتة؟",
      "ما هو Web Automation؟"
    ];

    for (const question of questions) {
      const suggestion = el("button", "", question);
      suggestion.type = "button";

      suggestion.addEventListener("click", () => {
        ui.question.value = question;
        autoResize();
        ui.question.focus();
      });

      suggestions.append(suggestion);
    }

    welcome.append(suggestions);
    ui.messages.replaceChildren(welcome);
  }

  // ==========================================
  // البحث
  // ==========================================

  function matchesChat(chat) {
    if (!search) return true;

    const title = String(chat.title || "").toLowerCase();

    return (
      title.includes(search) ||
      chat.history.some(item =>
        String(item.text || "")
          .toLowerCase()
          .includes(search)
      )
    );
  }

  function heading(text, onAdd) {
    const section = el("div", "side-section");

    section.append(el("span", "", text));

    if (onAdd) {
      section.append(button(
        "مشروع جديد",
        "plus",
        onAdd
      ));
    }

    return section;
  }

  // ==========================================
  // صف المحادثة في القائمة
  // ==========================================

  function chatRow(chat) {
    const row = el("div", "side-row");

    if (chat.id === activeChatId) {
      row.classList.add("active");
    }

    const main = labeledButton(
      chat.title || "محادثة",
      "message",
      () => openChat(chat),
      "side-main"
    );

    main.querySelector("span").className = "side-title";

    const more = button(
      "خيارات المحادثة",
      "more",
      () => chatMenu(chat, more),
      "side-control"
    );

    row.append(main);

    if (chat.isPinned) {
      const pinned = el("span", "side-pin");
      pinned.append(icon("pin"));
      row.append(pinned);
    }

    row.append(more);

    return row;
  }

  // ==========================================
  // صف المشروع في القائمة
  // ==========================================

  function projectRow(project, forceOpen = false) {
    const wrapper = el("div");
    const row = el("div", "side-row");

    if (selectedProjectId === project.id) {
      row.classList.add("selected");
    }

    const expanded =
      expandedProjects.has(project.id) || forceOpen;

    const main = labeledButton(
      project.name,
      expanded ? "folder-open" : "folder",
      () => showProjectHome(project),
      "side-main"
    );

    main.querySelector("span").className = "side-title";

    const toggle = button(
      expanded ? "إغلاق المشروع" : "فتح المشروع",
      "chevron",
      () => {
        expandedProjects.has(project.id)
          ? expandedProjects.delete(project.id)
          : expandedProjects.add(project.id);

        renderSidebar();
      },
      "side-control always"
    );

    if (expanded) {
      toggle.querySelector("svg")
        .classList.add("rotated");
    }

    const plus = button(
      "محادثة داخل المشروع",
      "plus",
      () => createNewChat(project.id),
      "side-control"
    );

    const more = button(
      "خيارات المشروع",
      "more",
      () => projectMenu(project, more),
      "side-control"
    );

    row.append(main);

    if (project.isPinned) {
      const pinned = el("span", "side-pin");
      pinned.append(icon("pin"));
      row.append(pinned);
    }

    row.append(toggle, plus, more);
    wrapper.append(row);

    if (expanded) {
      const children = el("div", "folder-children");

      const nameMatched =
        search &&
        project.name.toLowerCase().includes(search);

      const relevant = chats.filter(chat =>
        chat.projectId === project.id &&
        usableChat(chat) &&
        (nameMatched || matchesChat(chat))
      );

      if (relevant.length) {
        relevant.forEach(chat => {
          children.append(chatRow(chat));
        });
      } else {
        children.append(el(
          "div",
          "side-empty",
          "لا توجد محادثات"
        ));
      }

      wrapper.append(children);
    }

    return wrapper;
  }

  // ==========================================
  // تصنيف المحادثات حسب التاريخ
  // ==========================================

  function dateGroup(chat) {
    const timestamp = Number(
      chat.updatedAt || chat.createdAt || 0
    );

    if (!timestamp || !Number.isFinite(timestamp)) {
      return "محادثات سابقة";
    }

    const current = new Date();

    const midnight = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate()
    ).getTime();

    if (timestamp >= midnight) {
      return "اليوم";
    }

    if (timestamp >= midnight - 86400000) {
      return "أمس";
    }

    if (timestamp >= midnight - 7 * 86400000) {
      return "آخر 7 أيام";
    }

    return "محادثات سابقة";
  }

  // ==========================================
  // عرض الشريط الجانبي
  // ==========================================

  function renderSidebar() {
    const previousScroll = ui.list.scrollTop;

    closeMenu();
    ui.list.replaceChildren();

    const visible = chats.filter(usableChat);

    // المحادثات المثبتة
    const pinned = visible.filter(chat =>
      chat.isPinned &&
      matchesChat(chat)
    );

    if (pinned.length) {
      ui.list.append(heading("المثبتة"));

      pinned.forEach(chat => {
        ui.list.append(chatRow(chat));
      });
    }

    // المشاريع
    ui.list.append(
      heading("المشاريع", createProject)
    );

    const foundProjects = projects.filter(project =>
      !project.isArchived &&
      (
        !search ||
        project.name.toLowerCase().includes(search) ||
        visible.some(chat =>
          chat.projectId === project.id &&
          matchesChat(chat)
        )
      )
    );

    foundProjects.sort(
      (a, b) =>
        Number(Boolean(b.isPinned)) -
        Number(Boolean(a.isPinned))
    );

    foundProjects.forEach(project => {
      ui.list.append(
        projectRow(project, Boolean(search))
      );
    });

    // المحادثات خارج المشاريع
    const recent = visible
      .filter(chat =>
        !validProject(chat.projectId) &&
        !chat.isPinned &&
        matchesChat(chat)
      )
      .sort((a, b) =>
        Number(b.updatedAt || b.createdAt || 0) -
        Number(a.updatedAt || a.createdAt || 0)
      );

    ui.list.append(heading("المحادثات الأخيرة"));

    if (recent.length) {
      const groups = new Map();

      for (const chat of recent) {
        const group = dateGroup(chat);

        if (!groups.has(group)) {
          groups.set(group, []);
        }

        groups.get(group).push(chat);
      }

      for (const [label, group] of groups) {
        ui.list.append(
          el("div", "side-date", label)
        );

        group.forEach(chat => {
          ui.list.append(chatRow(chat));
        });
      }
    } else if (
      !foundProjects.length &&
      !pinned.length
    ) {
      ui.list.append(el(
        "div",
        "side-empty",
        search
          ? "لا توجد نتائج"
          : "لا توجد محادثات بعد"
      ));
    }

    ui.list.scrollTop = previousScroll;
  }

  // ==========================================
  // عرض الرسائل
  // ==========================================

  function addMessage(
    text,
    role,
    historyIndex = null
  ) {
    const message = el(
      "article",
      `message ${
        role === "user"
          ? "user-message"
          : "bot-message"
      }`
    );

    const content = el("div", "message-content");
    const raw = String(text ?? "");

    // Markdown مع تعقيم HTML
    if (
      role === "model" &&
      typeof marked !== "undefined" &&
      typeof DOMPurify !== "undefined"
    ) {
      content.innerHTML = DOMPurify.sanitize(
        marked.parse(raw)
      );

      content.querySelectorAll("a[href]").forEach(link => {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      });

      // إضافة زر نسخ لكل كتلة كود
      content.querySelectorAll("pre").forEach(pre => {
        const code = pre.querySelector("code");

        if (!code) return;

        const wrapper = el("div", "code-wrap");
        const toolbar = el("div", "code-toolbar");

        const language =
          code.className.match(
            /language-([a-zA-Z0-9+_-]+)/
          )?.[1] || "code";

        const copy = el(
          "button",
          "",
          "نسخ الكود"
        );

        copy.type = "button";

        copy.addEventListener("click", async () => {
          await copyText(code.textContent);

          const previous = copy.textContent;
          copy.textContent = "تم النسخ ✓";

          setTimeout(() => {
            if (copy.isConnected) {
              copy.textContent = previous;
            }
          }, 1500);
        });

        toolbar.append(
          el("span", "", language),
          copy
        );

        pre.replaceWith(wrapper);
        wrapper.append(toolbar, pre);
      });
    } else {
      // عرض النصوص والروابط بأمان
      const parts = raw.split(
        /(https?:\/\/[^\s]+)/g
      );

      for (const part of parts) {
        if (/^https?:\/\//.test(part)) {
          const link = el("a", "", part);

          link.href = part;
          link.target = "_blank";
          link.rel = "noopener noreferrer";

          content.append(link);
        } else {
          content.append(
            document.createTextNode(part)
          );
        }
      }
    }

    message.append(content);

    // إجراءات الرسالة
    if (historyIndex !== null) {
      const actions = el(
        "div",
        "message-actions"
      );

      const copy = labeledButton(
        "نسخ",
        "copy",
        () => copyText(raw, copy),
        "action-button"
      );

      actions.append(copy);

      if (role === "user") {
        actions.append(labeledButton(
          "تعديل",
          "edit",
          () => editQuestion(historyIndex, message),
          "action-button"
        ));
      }

      message.append(actions);
    }

    ui.messages.append(message);

    ui.messages.scrollTop =
      ui.messages.scrollHeight;

    return message;
  }

  // ==========================================
  // عرض المحادثة المحفوظة
  // ==========================================

  function renderHistory() {
    ui.messages.replaceChildren();

    const chat = currentChat();

    if (!chat) {
      showWelcome();
      return;
    }

    chat.history.forEach((item, index) => {
      addMessage(
        item.text,
        item.role,
        index
      );
    });

    ui.messages.scrollTop =
      ui.messages.scrollHeight;
  }

  // ==========================================
  // صندوق كتابة الرسائل
  // ==========================================

  function autoResize() {
    ui.question.style.height = "auto";

    ui.question.style.height =
      `${Math.min(ui.question.scrollHeight, 160)}px`;
  }

  function setBusy(value) {
    busy = value;

    ui.send.disabled = value;
    ui.question.disabled = value;

    $("newChatButton").disabled = value;

    ui.list.inert = value;
  }

  // ==========================================
  // الاتصال بخادم FastAPI
  // ==========================================

  async function askGemini(question, history) {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: question,
        history
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        window.location.replace("/login");
      }

      const error = new Error(
        `HTTP ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    const data = await response.json();

    if (
      typeof data.answer !== "string" ||
      !data.answer.trim() ||
      data.answer.trim() === ERROR_REPLY
    ) {
      throw new Error(
        "Gemini did not return a usable answer"
      );
    }

    return data.answer;
  }

  // ==========================================
  // إرسال الرسائل إلى Gemini
  // ==========================================

  async function sendMessage() {
    const question = ui.question.value.trim();

    if (!question || busy) return;

    const chat = currentChat();

    const previous = chat
      ? chat.history.map(item => ({
          role: item.role,
          text: item.text
        }))
      : [];

    setBusy(true);

    if (chat) {
      renderHistory();
    } else {
      ui.messages.replaceChildren();
    }

    addMessage(question, "user");

    const loading = addMessage(
      "جاري التفكير...",
      "model"
    );

    ui.question.value = "";
    autoResize();

    try {
      const answer = await askGemini(
        question,
        previous
      );

      if (chat) {
        // تحديث محادثة موجودة
        chat.history.push(
          {
            role: "user",
            text: question
          },
          {
            role: "model",
            text: answer
          }
        );

        chat.updatedAt = now();
      } else {
        // حفظ محادثة جديدة بعد نجاح الإجابة فقط
        const fresh = {
          id: createId(),
          title: shorten(question),
          history: [
            {
              role: "user",
              text: question
            },
            {
              role: "model",
              text: answer
            }
          ],
          createdAt: now(),
          updatedAt: now()
        };

        if (validProject(selectedProjectId)) {
          fresh.projectId = selectedProjectId;
        }

        chats.unshift(fresh);

        activeChatId = fresh.id;
        screen = "chat";
      }

      saveChats();

      ui.title.textContent = currentChat().title;

      renderSidebar();
      renderHistory();
    } catch (error) {
      console.error(
        "Gemini request failed:",
        error
      );

      loading.remove();

      const message =
        error.status === 429
          ? "وصلتِ إلى الحد اليومي للطلبات. يمكنك المحاولة غدًا."
          : error.status === 401
            ? "انتهت جلسة الدخول. سجّلي الدخول مجددًا."
            : "تعذر الحصول على الإجابة. يمكنك إعادة إرسال السؤال.";

      addMessage(message, "model");

      ui.question.value = question;
      autoResize();
    } finally {
      setBusy(false);
      ui.question.focus();
    }
  }

  // ==========================================
  // تعديل سؤال قديم في محادثة مستقلة
  // ==========================================

  async function editQuestion(index, bubble) {
    const chat = currentChat();

    if (
      busy ||
      !chat ||
      chat.history[index]?.role !== "user"
    ) return;

    const original = chat.history[index].text;

    const editor = el("div", "inline-edit");

    const input = el("textarea");
    input.value = original;

    const actions = el("div", "edit-footer");
    const feedback = el("p", "error-text");

    const cancel = labeledButton(
      "إلغاء",
      null,
      () => renderHistory()
    );

    const submit = labeledButton(
      "حفظ وإرسال",
      null,
      submitEdit
    );

    actions.append(cancel, submit);
    editor.append(input, actions, feedback);

    bubble.replaceChildren(editor);

    input.focus();

    input.setSelectionRange(
      input.value.length,
      input.value.length
    );

    input.addEventListener("keydown", event => {
      if (
        event.key === "Escape" &&
        !busy
      ) {
        renderHistory();
      }

      if (
        event.key === "Enter" &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault();
        submitEdit();
      }
    });

    async function submitEdit() {
      const updated = input.value.trim();

      if (!updated) {
        feedback.textContent =
          "السؤال لا يمكن أن يكون فارغًا.";
        return;
      }

      if (updated === original.trim()) {
        renderHistory();
        return;
      }

      if (busy) return;

      const preceding = chat.history
        .slice(0, index)
        .map(item => ({
          role: item.role,
          text: item.text
        }));

      setBusy(true);

      submit.disabled = true;
      cancel.disabled = true;

      feedback.textContent =
        "جاري إنشاء إجابة جديدة...";

      try {
        const answer = await askGemini(
          updated,
          preceding
        );

        // إنشاء محادثة جديدة دون تغيير الأصلية
        const branch = {
          id: createId(),
          title: index === 0
            ? shorten(updated)
            : `${shorten(chat.title, 30)} (معدلة)`,
          history: [
            ...preceding,
            {
              role: "user",
              text: updated
            },
            {
              role: "model",
              text: answer
            }
          ],
          createdAt: now(),
          updatedAt: now()
        };

        if (validProject(chat.projectId)) {
          branch.projectId = chat.projectId;
        }

        chats.unshift(branch);

        activeChatId = branch.id;
        selectedProjectId = branch.projectId || null;
        screen = "chat";

        saveChats();

        ui.title.textContent = branch.title;

        renderSidebar();
        renderHistory();
      } catch (error) {
        console.error(
          "Edit request failed:",
          error
        );

        feedback.textContent =
          "تعذّر إنشاء الإجابة الجديدة. " +
          "المحادثة الأصلية ما زالت محفوظة.";
      } finally {
        setBusy(false);

        submit.disabled = false;
        cancel.disabled = false;
      }
    }
  }

  // ==========================================
  // تسجيل الخروج
  // ==========================================

  async function signOut() {
    try {
      const response = await fetch("/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      window.location.replace("/login");
    } catch (error) {
      console.error("Logout failed:", error);

      alert(
        "تعذر تسجيل الخروج. " +
        "تحققي من اتصال السيرفر وحاولي مجددًا."
      );
    }
  }

  // ==========================================
  // قائمة التطبيقات والأدوات
  // ==========================================

  function setupQuickRail() {
    const rail = document.querySelector(".icon-rail");

    if (!rail || $("railApps")) return;

    const spacer = rail.querySelector(".rail-spacer");
    const archive = $("railArchive");
    const backup = $("backupButton");
    const theme = $("railTheme");

    function openApps() {
      const box = dialog("التطبيقات والأدوات");
      const grid = el("div", "rail-tool-grid");

      const tools = [
        {
          title: "البحث",
          iconName: "search",
          action: () => {
            showSidebar();
            ui.search.focus();
          }
        },
        {
          title: "المشاريع",
          iconName: "folder",
          action: () => {
            showSidebar();
            ui.list.scrollTo({
              top: 0,
              behavior: "smooth"
            });
          }
        },
        {
          title: "الأرشيف",
          iconName: "archive",
          action: archiveViewer
        },
        {
          title: "نسخة احتياطية",
          iconName: "download",
          action: backupAll
        },
        {
          title: "تسجيل الخروج",
          iconName: "logout",
          action: signOut
        }
      ];

      if (canImportLegacy()) {
        tools.push({
          title: "استعادة المحادثات القديمة",
          iconName: "restore",
          action: openLegacyImportDialog
        });
      }

      for (const tool of tools) {
        const item = labeledButton(
          tool.title,
          tool.iconName,
          () => {
            box.close();
            tool.action();
          },
          "rail-tool-item"
        );

        grid.append(item);
      }

      box.append(grid);
    }

    function openPlugins() {
      const box = dialog("الملحقات");

      box.append(el(
        "p",
        "rail-plugin-note",
        "لا توجد ملحقات خارجية متصلة حاليًا. " +
        "يمكن إضافة التكاملات لاحقًا من خلال Backend وAPI."
      ));
    }

    // زر التطبيقات
    const appsButton = button(
      "التطبيقات والأدوات",
      "apps",
      openApps
    );

    appsButton.id = "railApps";

    // زر الملحقات
    const pluginsButton = button(
      "الملحقات",
      "puzzle",
      openPlugins
    );

    pluginsButton.id = "railPlugins";

    rail.insertBefore(appsButton, archive);
    rail.insertBefore(pluginsButton, archive);

    // نقل زر النسخة الاحتياطية
    backup.className = "icon-button";
    backup.title = "تصدير نسخة احتياطية";
    backup.setAttribute("aria-label", backup.title);

    backup.replaceChildren(icon("download"));
    rail.insertBefore(backup, spacer);

    // نقل زر تغيير المظهر
    rail.insertBefore(theme, spacer);
  }

  // ==========================================
  // ربط أحداث المستخدم
  // ==========================================

  ui.form.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage();
  });

  ui.question.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      sendMessage();
    }
  });

  ui.question.addEventListener("input", autoResize);

  $("newChatButton").addEventListener(
    "click",
    () => createNewChat()
  );

  $("railNew").addEventListener(
    "click",
    () => createNewChat()
  );

  $("railHome").addEventListener(
    "click",
    toggleSidebar
  );

  $("mobileMenu").addEventListener(
    "click",
    toggleSidebar
  );

  ui.backdrop.addEventListener(
    "click",
    hideMobileSidebar
  );

  $("railSearch").addEventListener("click", () => {
    showSidebar();
    ui.search.focus();
  });

  $("railProjects").addEventListener("click", () => {
    showSidebar();
    ui.list.scrollTop = 0;
  });

  $("railArchive").addEventListener(
    "click",
    archiveViewer
  );

  $("backupButton").addEventListener(
    "click",
    backupAll
  );

  $("themeButton").addEventListener(
    "click",
    toggleTheme
  );

  $("railTheme").addEventListener(
    "click",
    toggleTheme
  );

  ui.search.addEventListener("input", () => {
    search = ui.search.value.trim().toLowerCase();
    renderSidebar();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) {
      hideMobileSidebar();
    }
  });

  // ==========================================
  // تشغيل التطبيق
  // ==========================================

  decorateIcons();
  setupQuickRail();
// الأبيض افتراضيًا، مع احترام اختيار المستخدم المحفوظ
const savedTheme = localStorage.getItem("theme");

setTheme(savedTheme === "dark" ? "dark" : "light");

  createNewChat();

  // إظهار خيار استعادة المحادثات القديمة عند الحاجة
  offerLegacyImportOnce();

})();
