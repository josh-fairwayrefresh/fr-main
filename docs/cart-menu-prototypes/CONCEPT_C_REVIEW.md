# Concept C — Proposed Public Cart Menu

This is a static, mobile-first visual proposal based on the CPO-selected Visual
Category Menu. `visual-category-menu.svg` is the source; its PNG is a review
preview. Neither file is a functional menu application.

The category cards represent categories present in the published snapshot.
Selecting a category expands its product list; a subcategory grouping is shown
only when present. Products flow in a single vertical list so a category with
25 or more products remains readable on mobile. The example demonstrates
available On Cart items and a clearly marked Sold Out item. In Inventory and
archived products are omitted. Price and description are absent because this
illustrative content has no approved values; those optional details should
appear only when populated, with no empty labels or fabricated values. Names
and category labels are illustrative, not imported or published course
inventory.

The co-brand header uses the supplied Fairway Refresh horizontal mark and
Monarch Bay Golf Club customer mark. The course name is the register-backed
Tony Lema Course example. The current Customer and Course register schemas
provide authoritative names but define no logo asset/reference fields; the
current public menu API also returns no Customer identity or logo. Therefore,
the supplied assets are used here as design examples, not as proof that logo
selection is currently configurable from those registers. That source/API
contract must be resolved before functional menu implementation.

The intended entry is a stable course-level public URL in the course's Google
Sites experience, resolving to the latest successfully published menu. This
prototype does not establish a URL format, configure Google Sites, or implement
the public route. The SVG's `menu-last-updated` text element is a static
placeholder marked with `data-field="published_at"` for future wiring to the
published snapshot timestamp; it does not load or display a live timestamp.
It adds no ordering, cart, checkout, or transaction behavior.