(() => {
  "use strict";

  const MAX_LOGO_BYTES = 10 * 1024 * 1024;
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // Footer year
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Mobile menu
  const toggle = document.querySelector(".nav-toggle");
  const menu = document.getElementById("mobile-menu");
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.classList.toggle("is-open", open);
    };
    toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  // Lead form
  document.querySelectorAll("[data-lead-form]").forEach(initLeadForm);

  function initLeadForm(form) {
    const logoInput = form.querySelector('input[type="file"][name="logo"]');
    const dropzone = form.querySelector("[data-dropzone]");
    const preview = form.querySelector("[data-logo-preview]");
    const previewImg = preview.querySelector("img");
    const previewName = preview.querySelector("[data-logo-name]");
    const previewSize = preview.querySelector("[data-logo-size]");
    const removeBtn = preview.querySelector("[data-logo-remove]");
    const statusEl = form.querySelector("[data-status]");
    const submitBtn = form.querySelector("[data-submit]");
    const submitLabel = submitBtn.textContent;
    let objectUrl = null;

    const formatSize = (bytes) => (bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`);

    // ----- Logo handling -----
    const isPng = (file) => {
      const typeOk = file.type === "image/png" || /\.png$/i.test(file.name);
      return typeOk && file.size > 0;
    };

    // Check the real file header, not just the extension or MIME type
    const hasPngSignature = (file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const bytes = new Uint8Array(reader.result);
        resolve(PNG_SIGNATURE.every((b, i) => bytes[i] === b));
      };
      reader.onerror = () => resolve(false);
      reader.readAsArrayBuffer(file.slice(0, 8));
    });

    const clearPreview = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      previewImg.removeAttribute("src");
      preview.classList.remove("is-visible");
    };

    const setLogoError = (message) => {
      setFieldError("logo", message);
    };

    const handleLogo = async (file) => {
      setLogoError("");
      if (!file) {
        clearPreview();
        return false;
      }
      if (!isPng(file)) {
        logoInput.value = "";
        clearPreview();
        setLogoError("Please upload a PNG file.");
        return false;
      }
      if (file.size > MAX_LOGO_BYTES) {
        logoInput.value = "";
        clearPreview();
        setLogoError("Your logo is larger than 10 MB. Please upload a smaller PNG.");
        return false;
      }
      if (!(await hasPngSignature(file))) {
        logoInput.value = "";
        clearPreview();
        setLogoError("This file isn't a valid PNG. Please export your logo as PNG and try again.");
        return false;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      previewImg.src = objectUrl;
      previewName.textContent = file.name;
      previewSize.textContent = formatSize(file.size);
      preview.classList.add("is-visible");
      return true;
    };

    logoInput.addEventListener("change", () => handleLogo(logoInput.files[0]));

    removeBtn.addEventListener("click", () => {
      logoInput.value = "";
      clearPreview();
      logoInput.focus();
    });

    // Drag and drop
    ["dragenter", "dragover"].forEach((type) => {
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.add("is-drag");
      });
    });
    ["dragleave", "drop"].forEach((type) => {
      dropzone.addEventListener(type, (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-drag");
      });
    });
    dropzone.addEventListener("drop", (e) => {
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (!file) return;
      // Put the dropped file into the real input so it is submitted with the form
      const transfer = new DataTransfer();
      transfer.items.add(file);
      logoInput.files = transfer.files;
      handleLogo(file);
    });

    // ----- Validation -----
    const setFieldError = (name, message) => {
      const errorEl = form.querySelector(`[data-error-for="${name}"]`);
      const field = errorEl ? errorEl.closest(".field") : null;
      if (errorEl) errorEl.textContent = message;
      if (field) field.classList.toggle("is-invalid", Boolean(message));
    };

    const validate = () => {
      let firstInvalid = null;
      const fail = (name, message, el) => {
        setFieldError(name, message);
        if (!firstInvalid && el) firstInvalid = el;
      };

      // Clear previous errors
      form.querySelectorAll("[data-error-for]").forEach((el) => setFieldError(el.dataset.errorFor, ""));

      form.querySelectorAll("input[required]:not([type='file']), select[required], textarea[required]").forEach((el) => {
        const value = el.value.trim();
        if (!value) {
          fail(el.name, "This field is required.", el);
        } else if (el.type === "email" && !EMAIL_RE.test(value)) {
          fail(el.name, "Please enter a valid email address.", el);
        }
      });

      const interests = form.querySelectorAll('input[name="interest"]:checked');
      if (interests.length === 0) {
        const first = form.querySelector('input[name="interest"]');
        fail("interest", "Choose at least one option.", first);
      }

      if (!logoInput.files || logoInput.files.length === 0) {
        fail("logo", "Please upload your logo as a PNG file.", dropzone);
      } else if (!isPng(logoInput.files[0])) {
        fail("logo", "Please upload a PNG file.", dropzone);
      }

      if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }
      return true;
    };

    // Clear a field's error as soon as the person fixes it
    form.addEventListener("input", (e) => {
      const name = e.target.name;
      if (name && form.querySelector(`[data-error-for="${name}"]`)) setFieldError(name, "");
    });

    // ----- Submission -----
    const showStatus = (type, message) => {
      statusEl.className = `form-status is-visible is-${type}`;
      statusEl.textContent = message;
    };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      statusEl.className = "form-status";
      statusEl.textContent = "";

      // Honeypot: silently pretend success for bots
      if (form.elements.website && form.elements.website.value) {
        showStatus("success", "Thanks! We'll be in touch within one business day.");
        form.reset();
        clearPreview();
        return;
      }

      if (!validate()) return;

      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        showStatus("error", "Sorry, this request form isn't connected yet. Please try again later.");
        console.error("Lead form has no data-endpoint set. Add the submission URL to the form.");
        return;
      }

      const data = new FormData(form);
      data.delete("website");
      data.set("submittedAt", new Date().toISOString());
      data.set("pageUrl", window.location.href);

      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try {
        const res = await fetch(endpoint, { method: "POST", body: data });
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
        form.reset();
        clearPreview();
        showStatus("success", "Thanks! We've received your request and will reply within one business day.");
        form.querySelector("input, select, textarea").focus();
      } catch (err) {
        console.error(err);
        showStatus("error", "Something went wrong and your request didn't send. Please check your connection and try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      }
    });
  }
})();
