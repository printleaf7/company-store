# Company Store Landing Pages

Two static pages for Printleaf's company store offering:

- `index.html`: for businesses and brands (employee, customer, event and partner merch)
- `schools.html`: for schools, districts, athletics, alumni and clubs

Both pages share `styles.css` and `script.js`. Imagery and icons are inline SVG in `assets/`, so there are no external image dependencies.

## Preview locally

    python3 -m http.server 8000

Then open http://localhost:8000/index.html or /schools.html.

## Lead capture form

Each form has `data-endpoint=""`. Until you set it, submitting shows a "not connected yet" message and nothing is sent.

To connect it, set `data-endpoint` on each `<form data-lead-form>` to a URL that accepts a `multipart/form-data` POST. The form sends:

- All visible fields (`firstName`, `lastName`, `email`, `phone`, `company` / `school`, and so on)
- `logo`: the uploaded PNG file
- `source`: `company-stores-business` or `company-stores-schools`
- `submittedAt` and `pageUrl`

Logo validation runs in the browser: the file must be PNG, at most 10 MB, and have a valid PNG header. Re-check the file on the server as well, since client-side checks can be bypassed.

## Things to replace before launch

- Brand name "Printleaf" and the footer copyright.
- The industry list in the hero strip and the FAQ answers, if your policies differ (shipping, returns, fundraising, delivery options).
- Product categories and copy in the product sections.
- Google Fonts (Inter) loads from a CDN. Remove the `<link>` tags to self-host if preferred.
