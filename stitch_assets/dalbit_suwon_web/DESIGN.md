---
name: Dalbit Suwon Web
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#d0c6ab'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#999077'
  outline-variant: '#4d4732'
  surface-tint: '#e9c400'
  primary: '#fff6df'
  on-primary: '#3a3000'
  primary-container: '#ffd700'
  on-primary-container: '#705e00'
  inverse-primary: '#705d00'
  secondary: '#bcc7de'
  on-secondary: '#263143'
  secondary-container: '#3e495d'
  on-secondary-container: '#aeb9d0'
  tertiary: '#f4f6ff'
  on-tertiary: '#233144'
  tertiary-container: '#ccdbf4'
  on-tertiary-container: '#526075'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe16d'
  primary-fixed-dim: '#e9c400'
  on-primary-fixed: '#221b00'
  on-primary-fixed-variant: '#544600'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#d5e3fd'
  tertiary-fixed-dim: '#b9c7e0'
  on-tertiary-fixed: '#0d1c2f'
  on-tertiary-fixed-variant: '#3a485c'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-hero:
    fontFamily: Manrope
    fontSize: 72px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  caption:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1440px
  gutter: 24px
  margin-desktop: 80px
  margin-tablet: 40px
  margin-mobile: 20px
  unit: 8px
---

## Brand & Style

The design system is an expansion of a mobile-first identity into a sophisticated, high-end web experience. It balances the ethereal "Moonlight" theme with the structural rigor required for administrative and editorial interfaces.

The brand personality is **Emotional, Traditional but Modern, and High-end**. It evokes the feeling of a quiet, moonlit night at a historic Korean fortress—calm, prestigious, and deeply atmospheric. 

The aesthetic is a blend of **Minimalism** and **Glassmorphism**. High-contrast typography and generous whitespace ensure modern readability, while frosted surfaces and subtle gold accents introduce a sense of luxury and depth. This system must feel as much like a premium editorial magazine as it does a functional administrative tool.

## Colors

The palette is rooted in a deep, nocturnal foundation to emphasize the "Moonlight Gold" primary color.

- **Primary (Moonlight Gold):** Used for key actions, brand moments, and critical highlights. It should be used sparingly to maintain its prestige.
- **Surface (Deep Navy/Slate):** The foundational background color. It provides a softer, more sophisticated alternative to pure black, allowing for better depth perception.
- **Functional Colors:**
    - **Success:** Emerald Green (#10B981) - subtle and desaturated to fit the dark theme.
    - **Warning:** Amber (#F59E0B).
    - **Error:** Rose (#E11D48).
- **Glassmorphism:** Use `surface_glass_hex` with a `20px` backdrop-blur for navigation bars, cards, and floating modals to create a sense of layering and "ethereal" light.

## Typography

The typography system relies on **Manrope** to bridge the gap between technical precision and friendly modernism. 

- **Hierarchy:** We utilize extreme scale for hero sections (`display-hero`) to create an editorial feel.
- **Readability:** On the deep navy background, body text should use a high-contrast off-white (#F8FAFC) to reduce eye strain while maintaining a premium look.
- **Labels:** Small labels and metadata should use increased letter-spacing and uppercase styling to evoke a structured, architectural feel.

## Layout & Spacing

This design system employs a **12-column fluid grid** for desktop and a **4-column grid** for mobile.

- **Desktop (1440px+):** 12 columns, 24px gutters, 80px side margins.
- **Tablet (768px - 1439px):** 8 columns, 20px gutters, 40px side margins.
- **Mobile (Up to 767px):** 4 columns, 16px gutters, 20px side margins.

Spacing follows an 8px linear scale. For high-end editorial layouts, use "Negative Space" as a functional element—leaving entire columns empty to draw focus to featured imagery or gold-accented typography.

## Elevation & Depth

Depth in this design system is achieved through **Glassmorphism and Tonal layering** rather than traditional heavy shadows.

- **Level 0 (Base):** The Deep Navy (#0F172A) background.
- **Level 1 (Cards/Sections):** A slightly lighter Slate (#1E293B) with a subtle 1px border (#334155).
- **Level 2 (Floating UI):** Glassmorphic surfaces with `backdrop-filter: blur(20px)` and a 10% white border to simulate light hitting the edge of glass.
- **Shadows:** When necessary, use extremely diffused, low-opacity shadows with a slight navy tint (`rgba(2, 6, 23, 0.5)`) to maintain a clean, modern look.

## Shapes

The shape language is **Rounded**, reflecting the soft glow of moonlight and traditional Korean architectural curves (like the eaves of a Hanok).

- **Standard Elements:** Buttons and input fields use a `0.5rem` (8px) radius.
- **Containers:** Large cards and hero sections use `1rem` (16px) for a softer, more modern presence.
- **Data Viz:** Charts should use rounded caps on bars and smooth interpolation on line graphs to maintain the organic, emotional feel.

## Components

### Hero Sections
Large-scale typography is center-aligned or asymmetric. Use "Moonlight Gold" for primary keywords within headlines. Backgrounds should be dark gradients or high-quality architectural photography with a 40% black overlay.

### Side Navigation (Admin)
A fixed-width (280px) sidebar using a semi-transparent glass effect. Active states are indicated by a Moonlight Gold vertical bar on the left and a subtle gold tint on the icon.

### Buttons
- **Primary:** Solid Moonlight Gold with Navy text. No border.
- **Secondary:** Ghost style with a 1px Gold border and Gold text.
- **Tertiary:** Subtle Slate background with White text for low-priority actions.

### Data Visualization
- **Charts:** Use a palette of Gold, Slate Blue, and Teal. Avoid harsh primary colors.
- **Tables:** Minimalist design with no vertical borders. Header rows use `label-md` styling. Row hover states should trigger a subtle Slate (#1E293B) highlight.

### Cards
Cards use the Level 1 elevation (Slate background) or Level 2 (Glassmorphism). They must include a subtle 1px border to ensure they don't bleed into the dark background.

### Input Fields
Dark Slate background with a 1px border. On focus, the border transitions to Moonlight Gold with a subtle outer glow.