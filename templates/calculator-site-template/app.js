/*
 * app.js — логика шаблона. Обычно править НЕ нужно: всё настраивается в config.js.
 * Правила безопасности, соблюдённые здесь:
 *  - никакого innerHTML с данными: только textContent / createElement;
 *  - ввод пользователя валидируется и ограничивается по диапазону;
 *  - форма: honeypot + таймер + ограничения длины + только HTTPS endpoint.
 */
(function () {
  "use strict";
  var C = window.SITE_CONFIG;
  if (!C) { return; }

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

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

  /* ---------- Калькулятор ---------- */
  var K = C.calculator;
  var lastEstimate = "";

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
    var v = parseFloat(String(el.value).replace(",", "."));
    return isFinite(v) && v > 0 ? v : 0;
  }
  function money(v) {
    return K.currency + Math.round(v).toLocaleString("en-US");
  }

  var elSys = $("#calc-system"), elSpace = $("#calc-space"), elCond = $("#calc-condition");
  var elExtras = $("#calc-extras"), elOut = $("#calc-result"), elNote = $("#calc-note");

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

    var recalc = function () {
      var area = num($("#calc-area")) || num($("#calc-length")) * num($("#calc-width"));
      if (!area) { elOut.textContent = "Введите размеры"; lastEstimate = ""; return; }
      if (area < K.minArea || area > K.maxArea) {
        elOut.textContent = "Площадь вне диапазона " + K.minArea + "–" + K.maxArea + " " + K.unit + ". Свяжитесь с нами.";
        lastEstimate = ""; return;
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
      var text = money(lo) + " – " + money(hi);
      elOut.textContent = text;
      lastEstimate = s.label + ", " + Math.round(area) + " " + K.unit + ": " + text;
    };
    $("#calc-form").addEventListener("input", recalc);
    $("#calc-form").addEventListener("change", recalc);
    $("#calc-form").addEventListener("submit", function (e) { e.preventDefault(); });
    $("#calc-to-form").addEventListener("click", function () {
      var h = $("#lead-estimate"); if (h) { h.value = lastEstimate; }
      var msg = document.querySelector("#lead-form textarea[name=message]");
      if (msg && lastEstimate && !msg.value) { msg.value = "Расчёт: " + lastEstimate; }
    });
  }

  /* ---------- Форма заявки ---------- */
  var form = $("#lead-form"), status = $("#lead-status");
  var openedAt = Date.now(), sending = false;

  function say(t, ok) { status.textContent = t; status.className = "small " + (ok ? "ok" : "err"); }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) { return; }
      var d = new FormData(form);

      // Анти-бот: honeypot заполнен или отправка слишком быстрая — молча "успех".
      if (String(d.get("website") || "") !== "" ||
          (Date.now() - openedAt) / 1000 < C.form.minSecondsBeforeSubmit) {
        say("Спасибо! Мы свяжемся с вами.", true); form.reset(); return;
      }
      if (!form.checkValidity()) { form.reportValidity(); say("Проверьте поля формы.", false); return; }

      var payload = {
        name: String(d.get("name")).trim().slice(0, 80),
        phone: String(d.get("phone")).trim().slice(0, 25),
        email: String(d.get("email") || "").trim().slice(0, 120),
        message: String(d.get("message") || "").trim().slice(0, 1500),
        estimate: String(d.get("estimate") || "").slice(0, 200)
      };

      var ep = String(C.form.endpoint || "");
      if (!ep) { // запасной вариант: письмо через почтовый клиент
        var body = "Имя: " + payload.name + "\nТелефон: " + payload.phone + "\nEmail: " + payload.email +
                   "\n" + payload.estimate + "\n\n" + payload.message;
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
        say("Спасибо! Мы свяжемся с вами в течение рабочего дня.", true); form.reset();
      }).catch(function () {
        say("Не удалось отправить. Позвоните нам: " + C.company.phone, false);
      }).then(function () { sending = false; });
    });
  }
})();
