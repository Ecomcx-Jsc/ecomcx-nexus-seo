// Danh mục loại schema cho trình tạo schema trong admin: trường nhập + giá trị mặc định (có thể dùng biến %title%, %excerpt%…).

export type FieldType = "text" | "textarea" | "url" | "date" | "datetime" | "number" | "select" | "image" | "duration" | "list" | "strings" | "json";
export interface SchemaField {
  key: string; label: string; type: FieldType;
  options?: Array<{ value: string; label: string }>;
  /** Trường con của danh sách (type = list). */
  fields?: SchemaField[];
  help?: string; placeholder?: string; required?: boolean;
}
export interface SchemaTypeDef { type: string; label: string; description: string; fields: SchemaField[]; defaults: Record<string, any> }

const AVAILABILITY = [
  { value: "InStock", label: "schemaTypes.in_stock" }, { value: "OutOfStock", label: "schemaTypes.out_of_stock" }, { value: "PreOrder", label: "schemaTypes.pre_order" },
  { value: "LimitedAvailability", label: "schemaTypes.limited_availability" }, { value: "Discontinued", label: "schemaTypes.discontinued" },
];
const offerFields: SchemaField[] = [
  { key: "price", label: "schemaTypes.price", type: "number" },
  { key: "currency", label: "schemaTypes.currency", type: "text", placeholder: "VND" },
  { key: "availability", label: "schemaTypes.availability", type: "select", options: AVAILABILITY },
  { key: "url", label: "schemaTypes.purchase_url", type: "url" },
  { key: "validFrom", label: "schemaTypes.price_valid_until", type: "date" },
];
const ratingFields: SchemaField[] = [
  { key: "ratingValue", label: "schemaTypes.average_rating", type: "number", help: "Thang 1–5" },
  { key: "reviewCount", label: "schemaTypes.number_of_reviews", type: "number" },
];
const addressFields: SchemaField[] = [
  { key: "street", label: "schemaTypes.address", type: "text" }, { key: "locality", label: "schemaTypes.district", type: "text" },
  { key: "region", label: "schemaTypes.state_province", type: "text" }, { key: "postalCode", label: "schemaTypes.postal_code", type: "text" },
  { key: "country", label: "schemaTypes.country_code", type: "text", placeholder: "VN" },
];

export const SCHEMA_TYPES: SchemaTypeDef[] = [
  {
    type: "Article", label: "schemaTypes.posts", description: "schemaTypes.article_blogposting_newsarticle_news_blog",
    fields: [
      { key: "articleType", label: "schemaTypes.type", type: "select", options: [{ value: "Article", label: "Article" }, { value: "BlogPosting", label: "schemaTypes.blog_post_blogposting" }, { value: "NewsArticle", label: "schemaTypes.news_newsarticle" }] },
      { key: "headline", label: "schemaTypes.title", type: "text" }, { key: "description", label: "schemaTypes.description", type: "textarea" },
    ],
    defaults: { articleType: "Article", headline: "%title%", description: "%excerpt%" },
  },
  {
    type: "FAQPage", label: "schemaTypes.faq", description: "schemaTypes.a_list_of_frequently_asked",
    fields: [{ key: "questions", label: "schemaTypes.question", type: "list", fields: [{ key: "question", label: "schemaTypes.question", type: "text", required: true }, { key: "answer", label: "schemaTypes.answer", type: "textarea", required: true }] }],
    defaults: { questions: [{ question: "", answer: "" }] },
  },
  {
    type: "HowTo", label: "schemaTypes.step_by_step_guide_howto", description: "schemaTypes.steps_supplies_tools_and_time",
    fields: [
      { key: "name", label: "schemaTypes.name", type: "text" }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "totalTime", label: "schemaTypes.total_time", type: "duration" }, { key: "estimatedCost", label: "schemaTypes.estimated_cost", type: "number" },
      { key: "currency", label: "schemaTypes.currency", type: "text", placeholder: "VND" },
      { key: "supplies", label: "schemaTypes.supplies", type: "strings" }, { key: "tools", label: "schemaTypes.tools", type: "strings" },
      { key: "steps", label: "schemaTypes.steps", type: "list", fields: [{ key: "name", label: "schemaTypes.step_name", type: "text" }, { key: "text", label: "schemaTypes.details", type: "textarea", required: true }, { key: "image", label: "Ảnh", type: "image" }, { key: "url", label: "schemaTypes.link_to_this_section", type: "url" }] },
    ],
    defaults: { name: "%title%", description: "%excerpt%", steps: [{ name: "", text: "" }] },
  },
  {
    type: "Product", label: "schemaTypes.product", description: "schemaTypes.price_availability_brand_reviews",
    fields: [
      { key: "name", label: "schemaTypes.product_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "sku", label: "SKU", type: "text" }, { key: "gtin", label: "schemaTypes.gtin_barcode", type: "text" },
      { key: "brand", label: "schemaTypes.brand", type: "text" }, ...offerFields, { key: "priceValidUntil", label: "schemaTypes.price_valid_until_2", type: "date" },
      { key: "condition", label: "schemaTypes.condition", type: "select", options: [{ value: "NewCondition", label: "schemaTypes.new" }, { value: "UsedCondition", label: "schemaTypes.used" }, { value: "RefurbishedCondition", label: "schemaTypes.refurbished" }] },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", currency: "VND", availability: "InStock", condition: "NewCondition" },
  },
  {
    type: "Service", label: "schemaTypes.service", description: "schemaTypes.service_offered_area_served_price",
    fields: [
      { key: "name", label: "schemaTypes.service_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "serviceType", label: "schemaTypes.service_type", type: "text" }, { key: "areaServed", label: "schemaTypes.area_served", type: "text" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "price", label: "schemaTypes.price", type: "number" }, { key: "currency", label: "schemaTypes.currency", type: "text", placeholder: "VND" },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", currency: "VND" },
  },
  {
    type: "Event", label: "schemaTypes.event", description: "schemaTypes.time_venue_or_online_tickets",
    fields: [
      { key: "name", label: "schemaTypes.event_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" },
      { key: "startDate", label: "schemaTypes.start", type: "datetime", required: true }, { key: "endDate", label: "schemaTypes.end", type: "datetime" },
      { key: "status", label: "schemaTypes.status", type: "select", options: [{ value: "EventScheduled", label: "schemaTypes.scheduled" }, { value: "EventPostponed", label: "schemaTypes.postponed" }, { value: "EventCancelled", label: "schemaTypes.cancel" }, { value: "EventRescheduled", label: "schemaTypes.rescheduled" }, { value: "EventMovedOnline", label: "schemaTypes.moved_online" }] },
      { key: "attendance", label: "schemaTypes.attendance_mode", type: "select", options: [{ value: "OfflineEventAttendanceMode", label: "schemaTypes.in_person" }, { value: "OnlineEventAttendanceMode", label: "schemaTypes.online" }, { value: "MixedEventAttendanceMode", label: "schemaTypes.mixed" }] },
      { key: "venue", label: "schemaTypes.venue", type: "text" }, ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "onlineUrl", label: "schemaTypes.online_url", type: "url" },
      { key: "organizer", label: "schemaTypes.organizer", type: "text" }, { key: "performer", label: "schemaTypes.performer", type: "text" },
      ...offerFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", status: "EventScheduled", attendance: "OfflineEventAttendanceMode", currency: "VND", availability: "InStock", "address.country": "VN" },
  },
  {
    type: "Recipe", label: "schemaTypes.recipe", description: "schemaTypes.ingredients_steps_time_nutrition",
    fields: [
      { key: "name", label: "schemaTypes.dish_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" }, { key: "image", label: "Ảnh", type: "image" },
      { key: "prepTime", label: "schemaTypes.prep_time", type: "duration" }, { key: "cookTime", label: "schemaTypes.cook_time", type: "duration" }, { key: "totalTime", label: "schemaTypes.total_time", type: "duration" },
      { key: "recipeYield", label: "schemaTypes.servings", type: "text", placeholder: "schemaTypes.4_servings" }, { key: "recipeCategory", label: "schemaTypes.category", type: "text" }, { key: "recipeCuisine", label: "schemaTypes.cuisine", type: "text", placeholder: "schemaTypes.vietnamese" },
      { key: "keywords", label: "schemaTypes.keyword", type: "text" }, { key: "calories", label: "schemaTypes.calories", type: "text" },
      { key: "ingredients", label: "schemaTypes.ingredients", type: "strings" },
      { key: "instructions", label: "schemaTypes.steps", type: "list", fields: [{ key: "name", label: "schemaTypes.step_name", type: "text" }, { key: "text", label: "schemaTypes.details", type: "textarea", required: true }, { key: "image", label: "Ảnh", type: "image" }] },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", recipeCuisine: "Việt Nam", ingredients: [""], instructions: [{ text: "" }] },
  },
  {
    type: "Course", label: "schemaTypes.course", description: "schemaTypes.a_course_and_its_provider",
    fields: [
      { key: "name", label: "schemaTypes.course_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea", required: true },
      { key: "provider", label: "schemaTypes.provider", type: "text" }, { key: "providerUrl", label: "schemaTypes.provider_website", type: "url" },
      { key: "courseMode", label: "schemaTypes.attendance_mode", type: "select", options: [{ value: "online", label: "schemaTypes.online" }, { value: "onsite", label: "schemaTypes.in_person" }, { value: "blended", label: "schemaTypes.mixed" }] },
      { key: "price", label: "schemaTypes.tuition", type: "number" }, { key: "currency", label: "schemaTypes.currency", type: "text", placeholder: "VND" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", courseMode: "online", currency: "VND" },
  },
  {
    type: "JobPosting", label: "schemaTypes.job_posting", description: "schemaTypes.job_posting_shown_in_google",
    fields: [
      { key: "title", label: "schemaTypes.position", type: "text", required: true }, { key: "description", label: "schemaTypes.job_description", type: "textarea", required: true },
      { key: "datePosted", label: "schemaTypes.date_posted", type: "date" }, { key: "validThrough", label: "schemaTypes.valid_through", type: "date" },
      { key: "employmentType", label: "schemaTypes.attendance_mode", type: "select", options: [{ value: "FULL_TIME", label: "schemaTypes.full_time" }, { value: "PART_TIME", label: "schemaTypes.part_time" }, { value: "CONTRACTOR", label: "schemaTypes.contractor" }, { value: "INTERN", label: "schemaTypes.intern" }, { value: "TEMPORARY", label: "schemaTypes.temporary" }] },
      { key: "organization", label: "schemaTypes.company", type: "text" }, { key: "organizationUrl", label: "schemaTypes.company_website", type: "url" }, { key: "organizationLogo", label: "schemaTypes.company_logo", type: "image" },
      ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "remote", label: "schemaTypes.remote_work", type: "select", options: [{ value: "", label: "schemaTypes.none" }, { value: "TELECOMMUTE", label: "schemaTypes.yes" }] },
      { key: "salaryMin", label: "schemaTypes.salary_from", type: "number" }, { key: "salaryMax", label: "schemaTypes.salary_to", type: "number" },
      { key: "salaryCurrency", label: "schemaTypes.currency", type: "text", placeholder: "VND" },
      { key: "salaryUnit", label: "Theo", type: "select", options: [{ value: "MONTH", label: "schemaTypes.month" }, { value: "YEAR", label: "schemaTypes.year" }, { value: "HOUR", label: "schemaTypes.hour" }, { value: "DAY", label: "schemaTypes.day" }] },
    ],
    defaults: { title: "%title%", description: "%excerpt%", employmentType: "FULL_TIME", salaryCurrency: "VND", salaryUnit: "MONTH", "address.country": "VN" },
  },
  {
    type: "SoftwareApplication", label: "schemaTypes.app_software", description: "schemaTypes.app_price_operating_system_rating",
    fields: [
      { key: "name", label: "schemaTypes.app_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "operatingSystem", label: "schemaTypes.operating_system", type: "text", placeholder: "Android, iOS, Windows" },
      { key: "applicationCategory", label: "schemaTypes.category_2", type: "select", options: ["BusinessApplication", "GameApplication", "EducationalApplication", "UtilitiesApplication", "FinanceApplication", "LifestyleApplication", "MultimediaApplication", "ShoppingApplication", "SocialNetworkingApplication", "TravelApplication"].map((v) => ({ value: v, label: v })) },
      { key: "price", label: "schemaTypes.price_0_free", type: "number" }, { key: "currency", label: "schemaTypes.currency", type: "text", placeholder: "VND" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", applicationCategory: "BusinessApplication", price: 0, currency: "VND" },
  },
  {
    type: "Book", label: "schemaTypes.book", description: "schemaTypes.book_author_isbn",
    fields: [
      { key: "name", label: "schemaTypes.book_title", type: "text", required: true }, { key: "author", label: "schemaTypes.author", type: "text" }, { key: "description", label: "schemaTypes.description", type: "textarea" },
      { key: "image", label: "schemaTypes.cover_image", type: "image" }, { key: "isbn", label: "ISBN", type: "text" }, { key: "numberOfPages", label: "schemaTypes.number_of_pages", type: "number" },
      { key: "bookFormat", label: "schemaTypes.format", type: "select", options: [{ value: "Hardcover", label: "schemaTypes.hardcover" }, { value: "Paperback", label: "schemaTypes.paperback" }, { value: "EBook", label: "schemaTypes.e_book" }, { value: "AudiobookFormat", label: "schemaTypes.audiobook" }] },
      { key: "publisher", label: "schemaTypes.publisher", type: "text" }, { key: "datePublished", label: "schemaTypes.publication_date", type: "date" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", bookFormat: "Paperback" },
  },
  {
    type: "VideoObject", label: "Video", description: "schemaTypes.video_in_the_post_detected",
    fields: [
      { key: "name", label: "schemaTypes.video_name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea", required: true },
      { key: "thumbnailUrl", label: "schemaTypes.image_preview", type: "image", required: true }, { key: "uploadDate", label: "schemaTypes.date_posted", type: "date" },
      { key: "duration", label: "schemaTypes.duration", type: "duration" }, { key: "contentUrl", label: "URL file video", type: "url" }, { key: "embedUrl", label: "schemaTypes.embed_url_youtube", type: "url" },
    ],
    defaults: { name: "%title%", description: "%excerpt%" },
  },
  {
    type: "Person", label: "schemaTypes.person", description: "schemaTypes.a_page_about_a_person",
    fields: [
      { key: "name", label: "schemaTypes.full_name", type: "text", required: true }, { key: "jobTitle", label: "schemaTypes.job_title", type: "text" }, { key: "description", label: "schemaTypes.about", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "email", label: "Email", type: "text" }, { key: "telephone", label: "schemaTypes.mobile", type: "text" },
      { key: "worksFor", label: "schemaTypes.works_for", type: "text" }, { key: "sameAs", label: "schemaTypes.profiles_social", type: "strings" },
    ],
    defaults: { name: "%title%", description: "%excerpt%" },
  },
  {
    type: "LocalBusiness", label: "schemaTypes.store_local_business", description: "schemaTypes.address_opening_hours_phone_one",
    fields: [
      { key: "businessType", label: "schemaTypes.business_type", type: "select", options: BUSINESS_TYPES().map((v) => ({ value: v.value, label: v.label })) },
      { key: "name", label: "schemaTypes.name", type: "text", required: true }, { key: "description", label: "schemaTypes.description", type: "textarea" }, { key: "image", label: "Ảnh", type: "image" },
      { key: "telephone", label: "schemaTypes.mobile", type: "text" }, { key: "priceRange", label: "schemaTypes.price_range", type: "text", placeholder: "$$" },
      ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "lat", label: "schemaTypes.latitude", type: "text" }, { key: "lng", label: "schemaTypes.longitude", type: "text" },
      { key: "openingHours", label: "schemaTypes.opening_hours", type: "list", fields: [{ key: "days", label: "schemaTypes.days_mo_tu_we_th", type: "text", placeholder: "Mo,Tu,We,Th,Fr" }, { key: "opens", label: "schemaTypes.opens", type: "text", placeholder: "08:00" }, { key: "closes", label: "schemaTypes.closes", type: "text", placeholder: "17:30" }] },
      ...ratingFields,
    ],
    defaults: { businessType: "LocalBusiness", name: "%sitename%", "address.country": "VN" },
  },
  {
    type: "Custom", label: "schemaTypes.custom_json_ld", description: "schemaTypes.paste_any_json_ld_for",
    fields: [{ key: "json", label: "JSON-LD", type: "json", help: "schemaTypes.one_object_with_type_e" }],
    defaults: { json: "{\n  \"@type\": \"\"\n}" },
  },
];

export function BUSINESS_TYPES() {
  return [
    { value: "Organization", label: "schemaTypes.organization_company" }, { value: "LocalBusiness", label: "schemaTypes.local_business" }, { value: "Store", label: "schemaTypes.store" },
    { value: "Restaurant", label: "schemaTypes.restaurant" }, { value: "CafeOrCoffeeShop", label: "schemaTypes.cafe" }, { value: "Hotel", label: "schemaTypes.hotel" },
    { value: "MedicalClinic", label: "schemaTypes.medical_clinic" }, { value: "Dentist", label: "Nha khoa" }, { value: "BeautySalon", label: "schemaTypes.beauty_salon" },
    { value: "AutoRepair", label: "schemaTypes.auto_repair" }, { value: "RealEstateAgent", label: "schemaTypes.real_estate" }, { value: "TravelAgency", label: "schemaTypes.travel_agency" },
    { value: "EducationalOrganization", label: "schemaTypes.education" }, { value: "LegalService", label: "schemaTypes.legal_services" }, { value: "FinancialService", label: "schemaTypes.financial_services" },
    { value: "HomeAndConstructionBusiness", label: "schemaTypes.construction_interiors" }, { value: "SportsActivityLocation", label: "schemaTypes.sports" }, { value: "NewsMediaOrganization", label: "schemaTypes.news_media" },
  ];
}

export const schemaDef = (type: string) => SCHEMA_TYPES.find((t) => t.type === type);
