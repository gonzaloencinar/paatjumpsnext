import type { Locale } from "./config";

// All store-facing UI copy, per locale. Spanish is the source of truth; `en`
// must mirror its shape (enforced with `satisfies` below). Product/collection
// content itself comes translated from Shopify via @inContext + Translate & Adapt.
const es = {
  home: {
    metaTitle: "Combas de saltar profesionales hechas a mano",
    metaDescription:
      "Combas segmentadas y PVC hechas a mano en España. Cuerda de 4 mm para más control: aprende, entrena y haz trucos. Envío gratis a Península y Baleares.",
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
    metaTitle: "Todas las combas",
    metaDescription:
      "Explora todas las combas de saltar Paat Jumps: segmentadas (beaded) y PVC de velocidad, hechas a mano en España. Filtra por tipo, color y precio.",
    h1: "Todas las combas",
    intro:
      "Combas segmentadas y combas PVC de velocidad, montadas a mano en España.",
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
  collection: {
    // Último fallback si la colección de Shopify no trae description ni SEO.
    fallbackDescription:
      "Colección {title} de Paat Jumps: combas de saltar hechas a mano en España.",
    breadcrumbHome: "Inicio",
    breadcrumbCatalog: "Combas",
    faqHeading: "Preguntas frecuentes",
  },
  // FAQs por colección (clave = handle de Shopify). Se renderizan al pie de la
  // página de categoría y alimentan el JSON-LD FAQPage: son el único contenido
  // indexable de esas páginas más allá de la parrilla, elegidas contra
  // búsquedas long-tail reales (qué es, cuál elegir, cómo ajustar, envío).
  collectionFaqs: {
    "combas-segmentadas": [
      {
        q: "¿Qué es una comba segmentada o beaded rope?",
        a: "Es una comba con cuentas (segmentos) de PVC ensartadas sobre una cuerda de nailon. Las cuentas le dan peso y sonido: se oye un «tic» cada vez que la comba toca el suelo, y ese ritmo te dice exactamente cuándo saltar. Por eso es la comba con la que más rápido se aprende y la preferida para freestyle.",
      },
      {
        q: "¿Es la mejor comba para aprender a saltar?",
        a: "Sí. El peso repartido mantiene la forma del arco aunque el giro no sea perfecto, y el sonido funciona como un metrónomo natural. En pocos días consigues un salto constante, y la misma comba te sirve después para trucos y freestyle.",
      },
      {
        q: "¿Qué diferencia a las combas segmentadas de Paat Jumps?",
        a: "La cuerda: 4 mm de grosor frente a los 2,5 mm habituales de otras marcas. Más control, más estabilidad en cada vuelta y mucha más durabilidad. Cada comba se monta a mano en España y los mangos llevan el logo grabado.",
      },
      {
        q: "¿Cómo ajusto la longitud de la comba?",
        a: "En un minuto y con unas tijeras: corta la cuerda sobrante y listo. Como referencia, pisa el centro de la comba con un pie: los mangos deben llegarte a la axila. Si estás empezando, déjala un poco más larga.",
      },
      {
        q: "¿Cuánto tarda el envío?",
        a: "Preparamos el pedido en 24 h y la entrega tarda 24/48 h en Península y Baleares, con envío gratis.",
      },
    ],
    "combas-pvc": [
      {
        q: "¿Para qué sirve una comba de PVC?",
        a: "Para velocidad y fluidez. La cuerda de PVC es ligera y gira muy rápido: ideal para saltos rápidos, dobles y combinaciones veloces de freestyle. Es la comba clásica de entrenamiento.",
      },
      {
        q: "¿Comba PVC o comba segmentada: cuál elijo?",
        a: "Si estás empezando o quieres aprender trucos con máximo control, la segmentada: su peso y su sonido marcan el ritmo. Si buscas ligereza y velocidad pura, la PVC. Muchos saltadores acaban usando las dos según el entrenamiento.",
      },
      {
        q: "¿Puedo ajustar la longitud?",
        a: "Sí, en un minuto y con unas tijeras: corta la cuerda sobrante a tu altura. Pisa el centro de la comba con un pie: los mangos deben llegarte a la axila.",
      },
      {
        q: "¿Puedo entrenar en exterior con ella?",
        a: "Sí, el PVC aguanta bien el exterior. Ten en cuenta que las superficies muy abrasivas, como el asfalto rugoso, desgastan antes cualquier cuerda: si puedes, alterna con suelos lisos.",
      },
      {
        q: "¿Cuánto tarda el envío?",
        a: "Preparamos el pedido en 24 h y la entrega tarda 24/48 h en Península y Baleares, con envío gratis.",
      },
    ],
  } as Record<string, { q: string; a: string }[]>,
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
    success:
      "Hecho: revisa tu correo, tu código −{percentage}% va de camino. 📬",
    successResent:
      "Ese email ya estaba suscrito: te reenviamos el código por si se coló en spam. 📬",
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
    metaTitle: "Handmade Beaded & PVC Jump Ropes",
    metaDescription:
      "Professional beaded and PVC jump ropes handmade in Spain. A thick 4 mm cord for control: learn, train and do tricks. Fast shipping across Europe.",
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
    metaTitle: "All Jump Ropes",
    metaDescription:
      "Browse every Paat Jumps jump rope: beaded ropes and PVC speed ropes, handmade in Spain. Filter by type, color and price.",
    h1: "All jump ropes",
    intro: "Beaded jump ropes and PVC speed ropes, hand-assembled in Spain.",
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
  collection: {
    fallbackDescription:
      "Paat Jumps {title} collection: jump ropes handmade in Spain.",
    breadcrumbHome: "Home",
    breadcrumbCatalog: "Jump ropes",
    faqHeading: "Frequently asked questions",
  },
  collectionFaqs: {
    "combas-segmentadas": [
      {
        q: "What is a beaded jump rope?",
        a: "A jump rope with PVC beads (segments) threaded over a nylon cord. The beads add weight and sound: you hear a “tick” every time the rope hits the ground, telling you exactly when to jump. That's why it's the fastest rope to learn on and the go-to rope for freestyle.",
      },
      {
        q: "Is a beaded rope the best jump rope for beginners?",
        a: "Yes. The distributed weight keeps the arc's shape even with an imperfect swing, and the sound works as a natural metronome. Within days you get a consistent jump — and the same rope carries you into tricks and freestyle.",
      },
      {
        q: "What makes Paat Jumps beaded jump ropes different?",
        a: "The cord: 4 mm thick versus the usual 2.5 mm of other brands. More control, more stability on every rotation and far better durability. Every rope is hand-assembled in Spain, with engraved handles.",
      },
      {
        q: "How do I adjust the length?",
        a: "In one minute with scissors: trim the excess cord and you're done. As a rule of thumb, step on the middle of the rope: the handles should reach your armpit. Beginners can leave it slightly longer.",
      },
      {
        q: "How long does shipping take?",
        a: "Orders are prepared within 24 h. Delivery takes 24/48 h in Spain and a few days across the rest of Europe.",
      },
    ],
    "combas-pvc": [
      {
        q: "What is a PVC jump rope for?",
        a: "Speed and flow. The PVC cord is light and spins very fast: ideal for quick jumps, double unders and fast freestyle combos. It's the classic training rope.",
      },
      {
        q: "PVC or beaded jump rope: which one should I pick?",
        a: "If you're starting out or want to learn tricks with maximum control, go beaded: its weight and sound set the rhythm. If you want pure lightness and speed, go PVC. Many jumpers end up using both depending on the session.",
      },
      {
        q: "Can I adjust the length?",
        a: "Yes, in one minute with scissors: trim the excess cord to your height. Step on the middle of the rope: the handles should reach your armpit.",
      },
      {
        q: "Can I train outdoors with it?",
        a: "Yes, PVC holds up well outdoors. Keep in mind that very abrasive surfaces, like rough asphalt, wear down any rope faster: alternate with smooth floors when you can.",
      },
      {
        q: "How long does shipping take?",
        a: "Orders are prepared within 24 h. Delivery takes 24/48 h in Spain and a few days across the rest of Europe.",
      },
    ],
  } as Record<string, { q: string; a: string }[]>,
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
    success:
      "Done — check your inbox, your −{percentage}% code is on its way. 📬",
    successResent:
      "That email was already subscribed — we've resent your code in case it landed in spam. 📬",
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
