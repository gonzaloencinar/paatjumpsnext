import type { Locale } from "./config";

// All store-facing UI copy, per locale. Spanish is the source of truth; `en`
// must mirror its shape (enforced with `satisfies` below). Product/collection
// content itself comes translated from Shopify via @inContext + Translate & Adapt.
const es = {
  home: {
    metaDescription:
      "Combas de saltar hechas a mano para atletas. Cable de acero recubierto y diseño duradero.",
  },
  hero: {
    titleLine1: "No todas las combas",
    titleLine2: "son iguales.",
    paragraph:
      "Paat Jumps nace de más de seis años de pasión por la comba. De aprender, mejorar y ayudar a miles de personas a descubrir este deporte. Cada comba está montada a mano y cuidada hasta el último detalle.",
    cta: "Elige la tuya",
    paatAlt: "Paat Jumps, fundadora y referente del salto a la comba",
    stats: [
      { value: "+10k", label: "saltadores" },
      { value: "100%", label: "competición" },
      { value: "4.9★", label: "valoración" },
    ],
    marquee: [
      "Empuñaduras ergonómicas",
      "Hechas a mano en España",
      "Envío en 24/48h",
      "Usada por profesionales de la comba",
    ],
  },
  carousel: {
    headingPrefix: "Elige tu",
    headingHighlight: "comba.",
    viewAll: "Ver todas",
  },
  nav: {
    openMenu: "Abrir menú",
    closeMenu: "Cerrar menú",
    categories: "Categorías",
    viewRopes: "Ver combas",
    ourRopes: "Nuestras combas",
    fullCatalog: "Todo el catálogo",
    notSureWhich: "¿No sabes cuál elegir?",
    exploreAll: "Explora todas las combas Paat Jumps en un solo lugar.",
    viewAllRopes: "Ver todas las combas",
    searchPlaceholder: "Buscar productos...",
  },
  footer: {
    all: "Todas",
    pvc: "PVC",
    beaded: "Segmentadas",
    rightsReserved: "Todos los derechos reservados.",
  },
  cart: {
    open: "Abrir carrito",
    close: "Cerrar carrito",
    title: "Mi carrito",
    empty: "Tu carrito está vacío.",
    shipping: "Envío",
    freeStarred: "Gratis*",
    calculatedAtCheckout: "Se calcula al finalizar la compra",
    freeShippingFootnote: "*Envío gratis a Península y Baleares",
    total: "Total",
    checkout: "Finalizar compra",
    addToCart: "Añadir al carrito",
    soldOut: "Agotado",
    selectOption: "Selecciona una opción",
    buy: "Comprar",
    viewOptionsOf: "Ver opciones de",
    addToCartNamed: "Añadir {title} al carrito",
    soldOutNamed: "{title} agotado",
    remove: "Eliminar del carrito",
    increaseQty: "Aumentar cantidad",
    decreaseQty: "Reducir cantidad",
    freeShippingUnlockedPrefix: "🎉 ¡Genial! Tienes el",
    freeShippingUnlockedHighlight: "envío gratis",
    remainingPrefix: "Te faltan",
    remainingMiddle: "para conseguir el",
    remainingHighlight: "envío gratis",
    addMoreItems: "Añadir más artículos",
  },
  product: {
    related: "Productos relacionados",
    previousImage: "Imagen anterior del producto",
    nextImage: "Siguiente imagen del producto",
    selectImage: "Seleccionar imagen del producto",
    soldOutSuffix: "(Agotado)",
  },
  search: {
    metaTitle: "Buscar",
    metaDescription: "Busca productos en la tienda.",
    noResultsFor: "No hay combas que coincidan con",
    showingPrefix: "Mostrando",
    resultOne: "resultado",
    resultOther: "resultados",
    forWord: "para",
    noMatchFilters: "No hay combas que coincidan con estos filtros.",
    all: "Todas",
    type: "Tipo",
    sort: "Ordenar",
    filters: "Filtros",
    clear: "Limpiar",
    clearAll: "Limpiar todo",
    view: "Ver",
    ropeOne: "comba",
    ropeOther: "combas",
    price: "Precio",
    allRopesCost: "Todas las combas cuestan",
    sortLabels: {
      relevance: "Relevancia",
      "trending-desc": "Lo más vendido",
      "latest-desc": "Novedades",
      "price-asc": "Precio: de menor a mayor",
      "price-desc": "Precio: de mayor a menor",
    } as Record<string, string>,
  },
  page: {
    lastUpdatedPrefix: "Última actualización de este documento:",
  },
  error: {
    title: "¡Vaya!",
    message:
      "Ha ocurrido un problema con nuestra tienda. Puede ser algo temporal, vuelve a intentarlo, por favor.",
    retry: "Intentar de nuevo",
  },
  welcomeToast: {
    title: "🛍️ ¡Bienvenido a Paat Jumps!",
    description:
      "Combas de saltar hechas a mano para atletas. Explora la colección y encuentra la tuya.",
  },
  announcement: {
    ariaLabel: "Oferta de lanzamiento",
    success: "Hecho: revisa tu correo, tu código −20% va de camino. 📬",
    onFirstOrder: "en tu primer pedido",
    emailPlaceholder: "tu@email.com",
    yourEmail: "Tu email",
    sending: "Enviando…",
    wantMyCode: "Quiero mi código",
    invalidEmail: "Ese email no parece válido.",
    rateLimited: "Demasiados intentos, prueba en un rato.",
    genericError: "No se pudo completar el alta. Inténtalo de nuevo.",
    closeBar: "Cerrar barra de oferta",
  },
  discount: {
    appliedTitle: "Código {code} aplicado",
    appliedDescription: "Verás el descuento en tu carrito y en el checkout.",
    savedTitle: "Código {code} guardado",
    savedDescription: "Se aplicará automáticamente a tu carrito.",
  },
};

const en = {
  home: {
    metaDescription:
      "Handmade jump ropes for athletes. Coated steel cable and durable design.",
  },
  hero: {
    titleLine1: "Not all jump ropes",
    titleLine2: "are created equal.",
    paragraph:
      "Paat Jumps was born from more than six years of passion for jump rope. Learning, improving and helping thousands of people discover this sport. Every rope is hand-assembled and cared for down to the last detail.",
    cta: "Choose yours",
    paatAlt: "Paat Jumps, founder and jump rope athlete",
    stats: [
      { value: "+10k", label: "jumpers" },
      { value: "100%", label: "competition" },
      { value: "4.9★", label: "rating" },
    ],
    marquee: [
      "Ergonomic handles",
      "Handmade in Spain",
      "Fast EU shipping",
      "Used by jump rope professionals",
    ],
  },
  carousel: {
    headingPrefix: "Choose your",
    headingHighlight: "rope.",
    viewAll: "View all",
  },
  nav: {
    openMenu: "Open menu",
    closeMenu: "Close menu",
    categories: "Categories",
    viewRopes: "Shop ropes",
    ourRopes: "Our ropes",
    fullCatalog: "Full catalog",
    notSureWhich: "Not sure which one to pick?",
    exploreAll: "Explore every Paat Jumps rope in one place.",
    viewAllRopes: "View all ropes",
    searchPlaceholder: "Search products...",
  },
  footer: {
    all: "All",
    pvc: "PVC Ropes",
    beaded: "Beaded Ropes",
    rightsReserved: "All rights reserved.",
  },
  cart: {
    open: "Open cart",
    close: "Close cart",
    title: "My cart",
    empty: "Your cart is empty.",
    shipping: "Shipping",
    freeStarred: "Free*",
    calculatedAtCheckout: "Calculated at checkout",
    freeShippingFootnote: "*Free shipping in mainland Spain & Balearic Islands",
    total: "Total",
    checkout: "Checkout",
    addToCart: "Add to cart",
    soldOut: "Sold out",
    selectOption: "Select an option",
    buy: "Buy",
    viewOptionsOf: "View options for",
    addToCartNamed: "Add {title} to cart",
    soldOutNamed: "{title} sold out",
    remove: "Remove from cart",
    increaseQty: "Increase quantity",
    decreaseQty: "Decrease quantity",
    freeShippingUnlockedPrefix: "🎉 Great! You've unlocked",
    freeShippingUnlockedHighlight: "free shipping",
    remainingPrefix: "You're",
    remainingMiddle: "away from",
    remainingHighlight: "free shipping",
    addMoreItems: "Add more items",
  },
  product: {
    related: "Related products",
    previousImage: "Previous product image",
    nextImage: "Next product image",
    selectImage: "Select product image",
    soldOutSuffix: "(Sold out)",
  },
  search: {
    metaTitle: "Search",
    metaDescription: "Search for products in the store.",
    noResultsFor: "There are no ropes matching",
    showingPrefix: "Showing",
    resultOne: "result",
    resultOther: "results",
    forWord: "for",
    noMatchFilters: "No ropes match these filters.",
    all: "All",
    type: "Type",
    sort: "Sort",
    filters: "Filters",
    clear: "Clear",
    clearAll: "Clear all",
    view: "View",
    ropeOne: "rope",
    ropeOther: "ropes",
    price: "Price",
    allRopesCost: "All ropes cost",
    sortLabels: {
      relevance: "Relevance",
      "trending-desc": "Best selling",
      "latest-desc": "New arrivals",
      "price-asc": "Price: low to high",
      "price-desc": "Price: high to low",
    } as Record<string, string>,
  },
  page: {
    lastUpdatedPrefix: "This document was last updated on",
  },
  error: {
    title: "Oops!",
    message:
      "There was a problem with our store. It may be temporary — please try again.",
    retry: "Try again",
  },
  welcomeToast: {
    title: "🛍️ Welcome to Paat Jumps!",
    description:
      "Handmade jump ropes for athletes. Explore the collection and find yours.",
  },
  announcement: {
    ariaLabel: "Launch offer",
    success: "Done — check your inbox, your −20% code is on its way. 📬",
    onFirstOrder: "off your first order",
    emailPlaceholder: "you@email.com",
    yourEmail: "Your email",
    sending: "Sending…",
    wantMyCode: "Get my code",
    invalidEmail: "That email doesn't look valid.",
    rateLimited: "Too many attempts, try again in a bit.",
    genericError: "We couldn't complete the signup. Please try again.",
    closeBar: "Close offer bar",
  },
  discount: {
    appliedTitle: "Code {code} applied",
    appliedDescription: "You'll see the discount in your cart and at checkout.",
    savedTitle: "Code {code} saved",
    savedDescription: "It will be applied to your cart automatically.",
  },
};

export type Dictionary = typeof es;

const dictionaries: Record<Locale, Dictionary> = {
  es,
  en: en satisfies Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.es;
}

// Tiny "{token}" interpolation for the few templated strings above.
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  );
}
