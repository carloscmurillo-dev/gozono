// Contenido del sitio. Los textos vienen del sitio WordPress anterior.

export const company = {
  name: 'Grupo Ozono Internacional S. A.',
  shortName: 'Grupo Ozono',
  phone: '+506 2297-4585',
  phoneHref: 'tel:+50622974585',
  whatsappHref: 'https://wa.me/50685375865',
  email: 'info@gozono.com',
  address:
    '150 oeste, 150 norte del Colegio de Farmacéuticos. Casa # 35, Diagonal caseta del guarda del Parque, Moravia, San José, Costa Rica.',
  shortAddress: 'Moravia, San José, Costa Rica',
  linkedin: 'https://www.linkedin.com/company/grupo-ozono/',
};

export const helpdeskUrl = import.meta.env.PUBLIC_HELPDESK_URL ?? 'https://soporte.gozono.com';

export type NavItem = { label: string; href: string; children?: NavItem[] };

export const nav: NavItem[] = [
  { label: 'Inicio', href: '/' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Servicios', href: '/servicios' },
  { label: 'Proyectos', href: '/proyectos' },
  { label: 'Contacto', href: '/contacto' },
  {
    label: 'Recursos',
    href: '/recursos/material-complementario',
    children: [
      { label: 'Material complementario', href: '/recursos/material-complementario' },
      { label: 'Normativas y estándares', href: '/recursos/normativas' },
    ],
  },
];

export const credentials = [
  { value: '+20 años', label: 'de experiencia en ingeniería' },
  { value: 'ICE', label: 'Proveedores del Grupo ICE desde 1995' },
  { value: 'CFIA', label: 'Empresa incorporada al Colegio de Ingenieros y Arquitectos' },
  { value: '3G → 5G', label: 'Cobertura multibanda y multioperador' },
];

export type IconName = 'das' | 'link' | 'wifi' | 'radio';

export const services: { icon: IconName; title: string; summary: string; body: string }[] = [
  {
    icon: 'das',
    title: 'Sistemas de antenas distribuidas (DAS)',
    summary:
      'Antenas distribuidas que mejoran cobertura y capacidad en edificios, estadios, aeropuertos y hospitales.',
    body: 'Los sistemas de antenas distribuidas (DAS, por sus siglas en inglés) son soluciones de infraestructura que mejoran la cobertura y capacidad de señal en interiores o áreas de difícil acceso. Consisten en una red de antenas conectadas a una fuente central, que distribuyen la señal de forma eficiente, garantizando una conectividad móvil confiable en lugares como edificios, estadios, aeropuertos y hospitales.',
  },
  {
    icon: 'link',
    title: 'Enlaces inalámbricos',
    summary:
      'Transmisión de datos a alta velocidad entre puntos, sin cables: rápida implementación y bajo costo operativo.',
    body: 'Las soluciones de enlaces inalámbricos permiten la transmisión de datos a alta velocidad entre dos o más puntos sin necesidad de cables físicos. Utilizadas en entornos urbanos, rurales o industriales, ofrecen conectividad confiable para aplicaciones como acceso a internet, videovigilancia, respaldo de redes y expansión de infraestructura, con rápida implementación y bajo costo operativo.',
  },
  {
    icon: 'wifi',
    title: 'Diseño de redes Wi-Fi',
    summary:
      'Estudios de sitio y planificación de puntos de acceso para oficinas, centros educativos, industrias y espacios públicos.',
    body: 'El diseño de redes Wi-Fi consiste en planificar y optimizar la distribución de puntos de acceso inalámbricos para garantizar cobertura, capacidad y rendimiento en entornos específicos. A través de estudios de sitio y herramientas especializadas, se asegura una conectividad estable y segura para usuarios y dispositivos, adaptada a las necesidades de oficinas, centros educativos, industrias y espacios públicos.',
  },
  {
    icon: 'radio',
    title: 'Equipos de radiofrecuencia',
    summary:
      'Radios, antenas, filtros, amplificadores, cables y conectores para telecomunicaciones y seguridad.',
    body: 'Los equipos de radiofrecuencia son dispositivos esenciales para la transmisión y recepción de señales inalámbricas en aplicaciones como telecomunicaciones, radiocomunicación, seguridad y automatización. Incluyen radios, antenas, filtros y amplificadores, y están diseñados para operar en distintas bandas de frecuencia, ofreciendo alto rendimiento, confiabilidad y adaptación a diversos entornos operativos.',
  },
];

export const dasSolutions = [
  {
    title: 'Indoor DAS',
    body: 'Sistema de distribución de señal diseñado para mejorar la cobertura y capacidad de redes móviles dentro de edificios o estructuras cerradas como oficinas, centros comerciales, aeropuertos o estadios, donde la señal externa no llega adecuadamente.',
    points: [
      'Soporte multibanda y multioperador',
      'Aumento de la capacidad de usuarios conectados',
      'Arquitectura escalable según el tamaño del edificio',
    ],
    tone: 'teal',
  },
  {
    title: 'Outdoor DAS',
    body: 'Diseñado para extender y reforzar la cobertura celular en espacios abiertos o semiabiertos donde la señal es débil o inconsistente, como parques, campus universitarios, áreas urbanas densas, túneles o estadios al aire libre.',
    points: [
      'Cobertura en grandes áreas abiertas o de difícil acceso',
      'Capacidad para integrarse con redes urbanas existentes',
      'Antenas en postes, fachadas u otras estructuras exteriores',
    ],
    tone: 'slate',
  },
];

export const projects = [
  { title: 'Centro de Convenciones', detail: 'Sistema DAS · en conjunto con Grupo ICE', tag: 'DAS' },
  { title: 'Asamblea Legislativa', detail: 'Sistema DAS · en conjunto con Grupo ICE', tag: 'DAS' },
];

// Los PDFs se sirven desde public/recursos/. Hay que copiarlos del sitio
// anterior antes de apagar el hosting de WordPress (ver README).
export const downloads = [
  {
    title: 'oDAS',
    body: 'Un oDAS (Outdoor Distributed Antenna System) es una solución de cobertura inalámbrica que utiliza una red de antenas distribuidas en exteriores para mejorar la señal en áreas con alta demanda o cobertura limitada.',
    file: '/recursos/Infografia-oDAS.pdf',
  },
  {
    title: 'Beamforming',
    body: 'Tecnología que dirige la señal inalámbrica hacia un dispositivo específico en lugar de transmitirla en todas direcciones, mejorando la cobertura y la eficiencia de la red.',
    file: '/recursos/Infografia-Beamforming.pdf',
  },
  {
    title: 'Wi-Fi 6',
    body: 'Tecnología inalámbrica que permite conectar dispositivos a internet o a redes locales sin cables, usando ondas de radio; ideal para hogares, oficinas y espacios públicos.',
    file: '/recursos/Infografia-Wi-Fi.pdf',
  },
  {
    title: 'Seguridad pública',
    body: 'Conjunto de servicios y acciones destinados a proteger a la población ante emergencias, delitos o desastres, incluyendo la labor de policías, bomberos y servicios médicos de emergencia.',
    file: '/recursos/Seguridad-Publica.pdf',
  },
  {
    title: 'Redes privadas LTE y 5G',
    body: 'La quinta generación de redes móviles ofrece mayor velocidad, menor latencia y más dispositivos conectados, mejorando la cobertura y calidad del servicio en zonas densamente pobladas.',
    file: '/recursos/Redes-privadas-LTE-y-5G.pdf',
  },
  {
    title: 'Small Cells',
    body: 'Estaciones base de bajo alcance que refuerzan la cobertura y capacidad de redes móviles en áreas con alta demanda o señal débil, como interiores, zonas urbanas o eventos masivos.',
    file: '/recursos/Small-Cell-2.pdf',
  },
];

// Pendiente: logos de marcas, membresías y clientes (ICE, CFIA, Cámara,
// AmCham, Amphenol, iBwave, U Latina...). Se muestran como texto hasta
// tener los archivos.
export const brands = ['ICE', 'CFIA', 'AmCham', 'Cámara', 'Amphenol', 'iBwave'];
