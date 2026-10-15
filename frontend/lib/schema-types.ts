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
  { value: "InStock", label: "Còn hàng" }, { value: "OutOfStock", label: "Hết hàng" }, { value: "PreOrder", label: "Đặt trước" },
  { value: "LimitedAvailability", label: "Số lượng có hạn" }, { value: "Discontinued", label: "Ngừng kinh doanh" },
];
const offerFields: SchemaField[] = [
  { key: "price", label: "Giá", type: "number" },
  { key: "currency", label: "Tiền tệ", type: "text", placeholder: "VND" },
  { key: "availability", label: "Tình trạng", type: "select", options: AVAILABILITY },
  { key: "url", label: "Đường dẫn mua", type: "url" },
  { key: "validFrom", label: "Áp dụng từ", type: "date" },
];
const ratingFields: SchemaField[] = [
  { key: "ratingValue", label: "Điểm đánh giá trung bình", type: "number", help: "Thang 1–5" },
  { key: "reviewCount", label: "Số lượt đánh giá", type: "number" },
];
const addressFields: SchemaField[] = [
  { key: "street", label: "Địa chỉ", type: "text" }, { key: "locality", label: "Quận/Huyện", type: "text" },
  { key: "region", label: "Tỉnh/Thành phố", type: "text" }, { key: "postalCode", label: "Mã bưu chính", type: "text" },
  { key: "country", label: "Quốc gia (mã)", type: "text", placeholder: "VN" },
];

export const SCHEMA_TYPES: SchemaTypeDef[] = [
  {
    type: "Article", label: "Bài viết", description: "Article / BlogPosting / NewsArticle — tin tức, blog",
    fields: [
      { key: "articleType", label: "Loại", type: "select", options: [{ value: "Article", label: "Article" }, { value: "BlogPosting", label: "Bài blog (BlogPosting)" }, { value: "NewsArticle", label: "Tin tức (NewsArticle)" }] },
      { key: "headline", label: "Tiêu đề", type: "text" }, { key: "description", label: "Mô tả", type: "textarea" },
    ],
    defaults: { articleType: "Article", headline: "%title%", description: "%excerpt%" },
  },
  {
    type: "FAQPage", label: "Hỏi đáp (FAQ)", description: "Danh sách câu hỏi thường gặp — có thể hiện ngay trên kết quả tìm kiếm",
    fields: [{ key: "questions", label: "Câu hỏi", type: "list", fields: [{ key: "question", label: "Câu hỏi", type: "text", required: true }, { key: "answer", label: "Trả lời", type: "textarea", required: true }] }],
    defaults: { questions: [{ question: "", answer: "" }] },
  },
  {
    type: "HowTo", label: "Hướng dẫn từng bước (HowTo)", description: "Các bước thực hiện, vật liệu, dụng cụ, thời gian",
    fields: [
      { key: "name", label: "Tên", type: "text" }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "totalTime", label: "Tổng thời gian", type: "duration" }, { key: "estimatedCost", label: "Chi phí ước tính", type: "number" },
      { key: "currency", label: "Tiền tệ", type: "text", placeholder: "VND" },
      { key: "supplies", label: "Vật liệu", type: "strings" }, { key: "tools", label: "Dụng cụ", type: "strings" },
      { key: "steps", label: "Các bước", type: "list", fields: [{ key: "name", label: "Tên bước", type: "text" }, { key: "text", label: "Chi tiết", type: "textarea", required: true }, { key: "image", label: "Ảnh", type: "image" }, { key: "url", label: "Liên kết tới phần này", type: "url" }] },
    ],
    defaults: { name: "%title%", description: "%excerpt%", steps: [{ name: "", text: "" }] },
  },
  {
    type: "Product", label: "Sản phẩm", description: "Giá, tình trạng hàng, thương hiệu, đánh giá",
    fields: [
      { key: "name", label: "Tên sản phẩm", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "sku", label: "SKU", type: "text" }, { key: "gtin", label: "GTIN / mã vạch", type: "text" },
      { key: "brand", label: "Thương hiệu", type: "text" }, ...offerFields, { key: "priceValidUntil", label: "Giá áp dụng đến", type: "date" },
      { key: "condition", label: "Tình trạng sản phẩm", type: "select", options: [{ value: "NewCondition", label: "Mới" }, { value: "UsedCondition", label: "Đã qua sử dụng" }, { value: "RefurbishedCondition", label: "Tân trang" }] },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", currency: "VND", availability: "InStock", condition: "NewCondition" },
  },
  {
    type: "Service", label: "Dịch vụ", description: "Dịch vụ cung cấp, khu vực phục vụ, giá",
    fields: [
      { key: "name", label: "Tên dịch vụ", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "serviceType", label: "Loại dịch vụ", type: "text" }, { key: "areaServed", label: "Khu vực phục vụ", type: "text" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "price", label: "Giá", type: "number" }, { key: "currency", label: "Tiền tệ", type: "text", placeholder: "VND" },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", currency: "VND" },
  },
  {
    type: "Event", label: "Sự kiện", description: "Thời gian, địa điểm (hoặc trực tuyến), vé",
    fields: [
      { key: "name", label: "Tên sự kiện", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" },
      { key: "startDate", label: "Bắt đầu", type: "datetime", required: true }, { key: "endDate", label: "Kết thúc", type: "datetime" },
      { key: "status", label: "Trạng thái", type: "select", options: [{ value: "EventScheduled", label: "Đã lên lịch" }, { value: "EventPostponed", label: "Hoãn" }, { value: "EventCancelled", label: "Huỷ" }, { value: "EventRescheduled", label: "Đổi lịch" }, { value: "EventMovedOnline", label: "Chuyển sang trực tuyến" }] },
      { key: "attendance", label: "Hình thức", type: "select", options: [{ value: "OfflineEventAttendanceMode", label: "Trực tiếp" }, { value: "OnlineEventAttendanceMode", label: "Trực tuyến" }, { value: "MixedEventAttendanceMode", label: "Kết hợp" }] },
      { key: "venue", label: "Địa điểm", type: "text" }, ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "onlineUrl", label: "Đường dẫn trực tuyến", type: "url" },
      { key: "organizer", label: "Đơn vị tổ chức", type: "text" }, { key: "performer", label: "Người trình diễn", type: "text" },
      ...offerFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", status: "EventScheduled", attendance: "OfflineEventAttendanceMode", currency: "VND", availability: "InStock", "address.country": "VN" },
  },
  {
    type: "Recipe", label: "Công thức nấu ăn", description: "Nguyên liệu, các bước, thời gian, dinh dưỡng",
    fields: [
      { key: "name", label: "Tên món", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" }, { key: "image", label: "Ảnh", type: "image" },
      { key: "prepTime", label: "Thời gian chuẩn bị", type: "duration" }, { key: "cookTime", label: "Thời gian nấu", type: "duration" }, { key: "totalTime", label: "Tổng thời gian", type: "duration" },
      { key: "recipeYield", label: "Khẩu phần", type: "text", placeholder: "4 người" }, { key: "recipeCategory", label: "Loại món", type: "text" }, { key: "recipeCuisine", label: "Ẩm thực", type: "text", placeholder: "Việt Nam" },
      { key: "keywords", label: "Từ khoá", type: "text" }, { key: "calories", label: "Năng lượng (calo)", type: "text" },
      { key: "ingredients", label: "Nguyên liệu", type: "strings" },
      { key: "instructions", label: "Các bước", type: "list", fields: [{ key: "name", label: "Tên bước", type: "text" }, { key: "text", label: "Chi tiết", type: "textarea", required: true }, { key: "image", label: "Ảnh", type: "image" }] },
      ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", recipeCuisine: "Việt Nam", ingredients: [""], instructions: [{ text: "" }] },
  },
  {
    type: "Course", label: "Khoá học", description: "Khoá học và đơn vị đào tạo",
    fields: [
      { key: "name", label: "Tên khoá học", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea", required: true },
      { key: "provider", label: "Đơn vị đào tạo", type: "text" }, { key: "providerUrl", label: "Website đơn vị", type: "url" },
      { key: "courseMode", label: "Hình thức", type: "select", options: [{ value: "online", label: "Trực tuyến" }, { value: "onsite", label: "Trực tiếp" }, { value: "blended", label: "Kết hợp" }] },
      { key: "price", label: "Học phí", type: "number" }, { key: "currency", label: "Tiền tệ", type: "text", placeholder: "VND" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", courseMode: "online", currency: "VND" },
  },
  {
    type: "JobPosting", label: "Tuyển dụng", description: "Tin tuyển dụng — hiện trong Google việc làm",
    fields: [
      { key: "title", label: "Vị trí", type: "text", required: true }, { key: "description", label: "Mô tả công việc", type: "textarea", required: true },
      { key: "datePosted", label: "Ngày đăng", type: "date" }, { key: "validThrough", label: "Hạn nộp hồ sơ", type: "date" },
      { key: "employmentType", label: "Hình thức", type: "select", options: [{ value: "FULL_TIME", label: "Toàn thời gian" }, { value: "PART_TIME", label: "Bán thời gian" }, { value: "CONTRACTOR", label: "Hợp đồng" }, { value: "INTERN", label: "Thực tập" }, { value: "TEMPORARY", label: "Thời vụ" }] },
      { key: "organization", label: "Công ty", type: "text" }, { key: "organizationUrl", label: "Website công ty", type: "url" }, { key: "organizationLogo", label: "Logo công ty", type: "image" },
      ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "remote", label: "Làm từ xa", type: "select", options: [{ value: "", label: "Không" }, { value: "TELECOMMUTE", label: "Có" }] },
      { key: "salaryMin", label: "Lương từ", type: "number" }, { key: "salaryMax", label: "Lương đến", type: "number" },
      { key: "salaryCurrency", label: "Tiền tệ", type: "text", placeholder: "VND" },
      { key: "salaryUnit", label: "Theo", type: "select", options: [{ value: "MONTH", label: "Tháng" }, { value: "YEAR", label: "Năm" }, { value: "HOUR", label: "Giờ" }, { value: "DAY", label: "Ngày" }] },
    ],
    defaults: { title: "%title%", description: "%excerpt%", employmentType: "FULL_TIME", salaryCurrency: "VND", salaryUnit: "MONTH", "address.country": "VN" },
  },
  {
    type: "SoftwareApplication", label: "Ứng dụng / phần mềm", description: "Ứng dụng, giá, hệ điều hành, đánh giá",
    fields: [
      { key: "name", label: "Tên ứng dụng", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "operatingSystem", label: "Hệ điều hành", type: "text", placeholder: "Android, iOS, Windows" },
      { key: "applicationCategory", label: "Danh mục", type: "select", options: ["BusinessApplication", "GameApplication", "EducationalApplication", "UtilitiesApplication", "FinanceApplication", "LifestyleApplication", "MultimediaApplication", "ShoppingApplication", "SocialNetworkingApplication", "TravelApplication"].map((v) => ({ value: v, label: v })) },
      { key: "price", label: "Giá (0 = miễn phí)", type: "number" }, { key: "currency", label: "Tiền tệ", type: "text", placeholder: "VND" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", applicationCategory: "BusinessApplication", price: 0, currency: "VND" },
  },
  {
    type: "Book", label: "Sách", description: "Sách, tác giả, ISBN",
    fields: [
      { key: "name", label: "Tên sách", type: "text", required: true }, { key: "author", label: "Tác giả", type: "text" }, { key: "description", label: "Mô tả", type: "textarea" },
      { key: "image", label: "Ảnh bìa", type: "image" }, { key: "isbn", label: "ISBN", type: "text" }, { key: "numberOfPages", label: "Số trang", type: "number" },
      { key: "bookFormat", label: "Định dạng", type: "select", options: [{ value: "Hardcover", label: "Bìa cứng" }, { value: "Paperback", label: "Bìa mềm" }, { value: "EBook", label: "Sách điện tử" }, { value: "AudiobookFormat", label: "Sách nói" }] },
      { key: "publisher", label: "Nhà xuất bản", type: "text" }, { key: "datePublished", label: "Ngày xuất bản", type: "date" }, ...ratingFields,
    ],
    defaults: { name: "%title%", description: "%excerpt%", bookFormat: "Paperback" },
  },
  {
    type: "VideoObject", label: "Video", description: "Video trong bài (tự nhận diện, hoặc nhập tay)",
    fields: [
      { key: "name", label: "Tên video", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea", required: true },
      { key: "thumbnailUrl", label: "Ảnh xem trước", type: "image", required: true }, { key: "uploadDate", label: "Ngày đăng", type: "date" },
      { key: "duration", label: "Thời lượng", type: "duration" }, { key: "contentUrl", label: "URL file video", type: "url" }, { key: "embedUrl", label: "URL nhúng (YouTube…)", type: "url" },
    ],
    defaults: { name: "%title%", description: "%excerpt%" },
  },
  {
    type: "Person", label: "Người", description: "Trang giới thiệu một người",
    fields: [
      { key: "name", label: "Họ tên", type: "text", required: true }, { key: "jobTitle", label: "Chức danh", type: "text" }, { key: "description", label: "Giới thiệu", type: "textarea" },
      { key: "image", label: "Ảnh", type: "image" }, { key: "email", label: "Email", type: "text" }, { key: "telephone", label: "Điện thoại", type: "text" },
      { key: "worksFor", label: "Nơi làm việc", type: "text" }, { key: "sameAs", label: "Trang cá nhân (mạng xã hội)", type: "strings" },
    ],
    defaults: { name: "%title%", description: "%excerpt%" },
  },
  {
    type: "LocalBusiness", label: "Cửa hàng / doanh nghiệp địa phương", description: "Địa chỉ, giờ mở cửa, điện thoại (một chi nhánh)",
    fields: [
      { key: "businessType", label: "Loại hình", type: "select", options: BUSINESS_TYPES().map((v) => ({ value: v.value, label: v.label })) },
      { key: "name", label: "Tên", type: "text", required: true }, { key: "description", label: "Mô tả", type: "textarea" }, { key: "image", label: "Ảnh", type: "image" },
      { key: "telephone", label: "Điện thoại", type: "text" }, { key: "priceRange", label: "Mức giá", type: "text", placeholder: "$$" },
      ...addressFields.map((f) => ({ ...f, key: `address.${f.key}` })),
      { key: "lat", label: "Vĩ độ", type: "text" }, { key: "lng", label: "Kinh độ", type: "text" },
      { key: "openingHours", label: "Giờ mở cửa", type: "list", fields: [{ key: "days", label: "Ngày (Mo,Tu,We,Th,Fr,Sa,Su)", type: "text", placeholder: "Mo,Tu,We,Th,Fr" }, { key: "opens", label: "Mở", type: "text", placeholder: "08:00" }, { key: "closes", label: "Đóng", type: "text", placeholder: "17:30" }] },
      ...ratingFields,
    ],
    defaults: { businessType: "LocalBusiness", name: "%sitename%", "address.country": "VN" },
  },
  {
    type: "Custom", label: "Tuỳ chỉnh (JSON-LD)", description: "Dán JSON-LD bất kỳ — cho loại chưa có sẵn",
    fields: [{ key: "json", label: "JSON-LD", type: "json", help: "Một đối tượng có \"@type\", ví dụ {\"@type\":\"Movie\",\"name\":\"…\"}" }],
    defaults: { json: "{\n  \"@type\": \"\"\n}" },
  },
];

export function BUSINESS_TYPES() {
  return [
    { value: "Organization", label: "Tổ chức / công ty" }, { value: "LocalBusiness", label: "Doanh nghiệp địa phương" }, { value: "Store", label: "Cửa hàng" },
    { value: "Restaurant", label: "Nhà hàng" }, { value: "CafeOrCoffeeShop", label: "Quán cà phê" }, { value: "Hotel", label: "Khách sạn" },
    { value: "MedicalClinic", label: "Phòng khám" }, { value: "Dentist", label: "Nha khoa" }, { value: "BeautySalon", label: "Thẩm mỹ / làm đẹp" },
    { value: "AutoRepair", label: "Sửa xe" }, { value: "RealEstateAgent", label: "Bất động sản" }, { value: "TravelAgency", label: "Du lịch" },
    { value: "EducationalOrganization", label: "Giáo dục" }, { value: "LegalService", label: "Luật" }, { value: "FinancialService", label: "Tài chính" },
    { value: "HomeAndConstructionBusiness", label: "Xây dựng / nội thất" }, { value: "SportsActivityLocation", label: "Thể thao" }, { value: "NewsMediaOrganization", label: "Báo chí / truyền thông" },
  ];
}

export const schemaDef = (type: string) => SCHEMA_TYPES.find((t) => t.type === type);
