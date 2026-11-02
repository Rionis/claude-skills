/*
 * app.js — логика шаблона. Обычно править НЕ нужно: всё настраивается в config.js.
 * Правила, соблюдённые здесь:
 *  - никакого innerHTML с данными: только textContent / createElement;
 *  - ввод пользователя валидируется и ограничивается по диапазону;
 *  - ОДИН расчёт цены (estimate) и для экрана, и для заявки — цифры не могут разойтись;
 *  - форма: honeypot + таймер + ограничения длины + только HTTPS endpoint.
 */
(function () {
  "use strict";
  var C = window.SITE_CONFIG;
  if (!C) { return; }

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Дата "ГГГГ-ММ-ДД" ещё действует (включительно, по местному времени)? */
  function activeUntil(until) {
    if (!until) { return true; }
    var d = new Date(until + "T23:59:59");
    return isNaN(d) ? true : Date.now() <= d.getTime();
  }

  /* ---------- Контакты из конфига ---------- */
  var phoneDigits = String(C.company.phoneHref).replace(/[^0-9+]/g, "");
  $$("[data-phone-link]").forEach(function (a) {
    a.href = "tel:" + phoneDigits;
    if (a.textContent.trim() === "телефон") { a.textContent = C.company.phone; }
  });
  $$("[data-email-link]").forEach(function (a) {
    a.href = "mailto:" + encodeURIComponent(C.company.email).replace("%40", "@");
    a.textContent = C.company.email;
  });
  $$("[data-city]").forEach(function (el) { el.textContent = C.company.city; });
  $$("[data-company]").forEach(function (el) { el.textContent = C.company.name; });
  $$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Промо-полоса ---------- */
  var promo = $("#promo");
  if (promo && C.promo && C.promo.text && activeUntil(C.promo.until)) {
    promo.textContent = C.promo.text;
    promo.hidden = false;
  }

  /* ---------- Мобильное меню ---------- */
  var toggle = $(".nav-toggle"), nav = $("#nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  }

  /* ---------- Отзывы: реальная дата -> «N мес. назад» ---------- */
  $$("time.ago").forEach(function (el) {
    var d = new Date(el.getAttribute("datetime") + "T12:00:00"), now = new Date();
    if (isNaN(d) || d > now) { return; }
    var m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()) - (now.getDate() < d.getDate() ? 1 : 0);
    var days = Math.floor((now - d) / 864e5);
    el.textContent = m >= 24 ? Math.floor(m / 12) + " г. назад" : m >= 12 ? "год назад" :
                     m >= 1 ? m + " мес. назад" : days >= 7 ? Math.floor(days / 7) + " нед. назад" : "недавно";
  });

  /* ---------- Слайдер «до / после» ---------- */
  var ba = $("#ba"), knob = $("#ba-knob");
  if (ba && knob) {
    var pos = 50, dragging = false;
    var setPos = function (p) {
      pos = Math.max(0, Math.min(100, p));
      ba.style.setProperty("--x", pos + "%");
      knob.setAttribute("aria-valuenow", String(Math.round(pos)));
    };
    var fromX = function (x) { var r = ba.getBoundingClientRect(); setPos((x - r.left) / r.width * 100); };
    ba.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".ba-pairs")) { return; }
      dragging = true; ba.setPointerCapture(e.pointerId); fromX(e.clientX);
    });
    ba.addEventListener("pointermove", function (e) { if (dragging) { fromX(e.clientX); } });
    ba.addEventListener("pointerup", function () { dragging = false; });
    ba.addEventListener("pointercancel", function () { dragging = false; });
    knob.addEventListener("keydown", function (e) {
      var step = e.shiftKey ? 20 : 5;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") { setPos(pos - step); }
      else if (e.key === "ArrowRight" || e.key === "ArrowUp") { setPos(pos + step); }
      else if (e.key === "Home") { setPos(0); }
      else if (e.key === "End") { setPos(100); }
      else { return; }
      e.preventDefault();
    });
    $$(".ba-pairs button").forEach(function (b) {
      b.addEventListener("click", function () {
        ba.setAttribute("data-pair", b.getAttribute("data-pair"));
        $$(".ba-pairs button").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
      });
    });
    setPos(50);
  }

  /* ---------- Калькулятор ---------- */
  var K = C.calculator;
  var elSys = $("#calc-system"), elSpace = $("#calc-space"), elCond = $("#calc-condition");
  var elExtras = $("#calc-extras"), elOut = $("#calc-result"), elNote = $("#calc-note");
  var gate = K.mode === "gate";

  function fillSelect(sel, items) {
    items.forEach(function (it) {
      var o = document.createElement("option");
      o.value = it.id; o.textContent = it.label;
      sel.appendChild(o);
    });
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return list[0];
  }
  function num(el) {
    if (!el) { return 0; }
    var v = parseFloat(String(el.value).replace(",", "."));
    return isFinite(v) && v > 0 ? v : 0;
  }
  function money(v) { return K.currency + Math.round(v).toLocaleString("en-US"); }

  function presetArea() {
    var r = $("#calc-presets input:checked");
    if (!r) { return 0; }
    var p = byId(K.presets, r.value);
    return p ? p.area : 0;
  }

  /* ЕДИНСТВЕННОЕ место, где считается цена. Возвращает null или {ok, text, summary}. */
  function estimate() {
    if (!elSys) { return null; }
    var area = presetArea() || num($("#calc-area")) || num($("#calc-length")) * num($("#calc-width"));
    if (!area) { return null; }
    if (area < K.minArea || area > K.maxArea) {
      return { ok: false, text: "Площадь вне диапазона " + K.minArea + "–" + K.maxArea + " " + K.unit + ". Свяжитесь с нами." };
    }
    var s = byId(K.systems, elSys.value);
    var k = byId(K.spaces, elSpace.value).k * byId(K.conditions, elCond.value).k;
    var lo = area * s.min * k, hi = area * s.max * k;
    $$("#calc-extras input:checked").forEach(function (cb) {
      var x = byId(K.extras, cb.value);
      var add = (x.fixed || 0) + (x.perUnit || 0) * area;
      lo += add; hi += add;
    });
    lo = Math.max(lo, K.minJobPrice); hi = Math.max(hi, K.minJobPrice);
    var disc = (K.discount && K.discount.amount > 0 && activeUntil(K.discount.until)) ? K.discount.amount : 0;
    lo = Math.max(0, lo - disc); hi = Math.max(0, hi - disc);
    var text = money(lo) + " – " + money(hi);
    var tail = disc ? " (" + K.discount.label + " " + money(disc) + " учтена)" : "";
    return { ok: true, text: text, summary: s.label + ", " + Math.round(area) + " " + K.unit + ": " + text + tail };
  }

  if (elSys) {
    fillSelect(elSys, K.systems);
    fillSelect(elSpace, K.spaces);
    fillSelect(elCond, K.conditions);
    $$("[data-unit]").forEach(function (el) { el.textContent = K.unit; });
    K.extras.forEach(function (x) {
      var lab = document.createElement("label");
      var cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = x.id;
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(" " + x.label));
      elExtras.appendChild(lab);
    });
    elNote.textContent = K.disclaimer;

    // Пресеты размеров
    var presetsWrap = $("#calc-presets-wrap"), presetsBox = $("#calc-presets"), manual = $("#calc-manual");
    if (K.presets && K.presets.length && presetsBox) {
      K.presets.forEach(function (p, i) {
        var lab = document.createElement("label");
        var r = document.createElement("input");
        r.type = "radio"; r.name = "preset"; r.value = p.id; r.checked = i === 0;
        var sp = document.createElement("span"); sp.textContent = p.label;
        lab.appendChild(r); lab.appendChild(sp);
        presetsBox.appendChild(lab);
      });
    } else if (presetsWrap) {
      presetsWrap.hidden = true;
    }
    var syncManual = function () { if (manual) { manual.hidden = presetArea() > 0; } };
    syncManual();

    if (gate) { $("#calc-to-form").textContent = "Показать цену"; }

    var recalc = function () {
      syncManual();
      var e = estimate();
      if (!e) { elOut.textContent = "Введите размеры"; return; }
      elOut.textContent = (gate && e.ok) ? K.gateHint : e.text;
      elOut.classList.toggle("gated", gate && e.ok);
    };
    $("#calc-form").addEventListener("input", recalc);
    $("#calc-form").addEventListener("change", recalc);
    $("#calc-form").addEventListener("submit", function (e) { e.preventDefault(); });
    $("#calc-to-form").addEventListener("click", function () {
      var e = estimate();
      var msg = document.querySelector("#lead-form textarea[name=message]");
      if (!gate && msg && e && e.ok && !msg.value) { msg.value = "Расчёт: " + e.summary; }
    });
    recalc();
  }

  /* ---------- Нижняя панель на мобильных ---------- */
  var dock = $("#dock"), hero = $(".hero"), contact = $("#contact");
  if (dock && hero && "IntersectionObserver" in window) {
    var pastHero = false, nearForm = false;
    var setDock = function () {
      var on = pastHero && !nearForm;
      dock.classList.toggle("show", on);
      dock.setAttribute("aria-hidden", on ? "false" : "true");
      $$("#dock a").forEach(function (a) { a.tabIndex = on ? 0 : -1; });
    };
    new IntersectionObserver(function (es) {
      pastHero = !es[0].isIntersecting && es[0].boundingClientRect.top < 0; setDock();
    }).observe(hero);
    if (contact) {
      new IntersectionObserver(function (es) { nearForm = es[0].isIntersecting; setDock(); }).observe(contact);
    }
  }

  /* ---------- Форма заявки ---------- */
  var form = $("#lead-form"), status = $("#lead-status");
  var openedAt = Date.now(), sending = false;

  // Источник трафика из ссылки (?gclid=..., ?utm_source=...) — только допустимые символы и длина.
  try {
    var q = new URLSearchParams(location.search);
    ["gclid", "utm_source", "utm_campaign"].forEach(function (k) {
      var f = form && form.elements[k];
      var v = (q.get(k) || "").replace(/[^\w.\-~]/g, "").slice(0, 120);
      if (f) { f.value = v; }
    });
  } catch (e) { /* старый браузер — пропускаем */ }

  function say(t, ok) { status.textContent = t; status.className = "small " + (ok ? "ok" : "err"); }

  function successText() {
    var e = estimate();
    if (gate && e && e.ok) { return "Спасибо! " + K.gateDone + " " + e.text + ". " + K.disclaimer; }
    return "Спасибо! Мы свяжемся с вами в течение рабочего дня.";
  }

  if (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (sending) { return; }
      var d = new FormData(form);

      // Анти-бот: honeypot заполнен или отправка слишком быстрая — молча "успех".
      if (String(d.get("website") || "") !== "" ||
          (Date.now() - openedAt) / 1000 < C.form.minSecondsBeforeSubmit) {
        say("Спасибо! Мы свяжемся с вами.", true); form.reset(); return;
      }
      if (!form.checkValidity()) { form.reportValidity(); say("Проверьте поля формы.", false); return; }

      var e = estimate();
      var consentEl = $("#consent-text");
      var payload = {
        name: String(d.get("name")).trim().slice(0, 80),
        phone: String(d.get("phone")).trim().slice(0, 25),
        email: String(d.get("email") || "").trim().slice(0, 120),
        message: String(d.get("message") || "").trim().slice(0, 1500),
        estimate: (e && e.ok) ? e.summary : "",       // та же цифра, что видит клиент
        consent_text: consentEl ? consentEl.textContent : "",
        gclid: String(d.get("gclid") || ""),
        utm_source: String(d.get("utm_source") || ""),
        utm_campaign: String(d.get("utm_campaign") || ""),
        submitted_at: new Date().toISOString()
      };

      var ep = String(C.form.endpoint || "");
      if (!ep) { // запасной вариант: письмо через почтовый клиент
        var body = "Имя: " + payload.name + "\nТелефон: " + payload.phone + "\nEmail: " + payload.email +
                   "\n" + payload.estimate + "\n\n" + payload.message;
        say(successText(), true);
        window.location.href = "mailto:" + C.company.email +
          "?subject=" + encodeURIComponent("Заявка с сайта") + "&body=" + encodeURIComponent(body);
        return;
      }
      if (ep.indexOf("https://") !== 0) { say("Ошибка настройки формы (нужен https).", false); return; }

      sending = true; say("Отправляем…", true);
      fetch(ep, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        referrerPolicy: "strict-origin-when-cross-origin"
      }).then(function (r) {
        if (!r.ok) { throw new Error(String(r.status)); }
        say(successText(), true); form.reset();
      }).catch(function () {
        say("Не удалось отправить. Позвоните нам: " + C.company.phone, false);
      }).then(function () { sending = false; });
    });
  }

  if (reduceMotion) { document.documentElement.style.scrollBehavior = "auto"; }
})();
