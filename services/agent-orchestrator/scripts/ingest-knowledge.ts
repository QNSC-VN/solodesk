import postgres from 'postgres';
import { embedText } from '../src/platform/embeddings';

/**
 * Admin-role script, run manually (`pnpm ingest:knowledge`) — never part of
 * the running service, never invoked by solodesk_agent's own connection.
 * Same "let key, I will input later" pattern as every 3rd-party credential
 * in this repo: this seeds a handful of CLEARLY-LABELED SAMPLE documents so
 * the search-knowledge-base tool and its retrieval pipeline are genuinely
 * exercisable end-to-end. It is explicitly NOT a real corpus of Vietnamese
 * tax/business-registration law — every entry below carries its own
 * disclaimer in the content itself, on purpose, so the disclaimer survives
 * even if a chunk is later surfaced out of context. Replace this array with
 * a real, sourced document corpus before this is ever used for a genuine
 * household business's formalization guidance.
 */
const SAMPLE_DOCUMENTS: { title: string; source: string; content: string }[] = [
  {
    title: '[SAMPLE - not official guidance] Đăng ký hộ kinh doanh, tổng quan chung',
    source: 'demo-placeholder',
    content:
      'Đây là nội dung mẫu (demo) dùng để kiểm thử tính năng search_knowledge_base, không phải hướng dẫn chính thức. Nhìn chung, thủ tục đăng ký hộ kinh doanh thường bao gồm: chuẩn bị giấy tờ tùy thân, nộp hồ sơ tại cơ quan đăng ký kinh doanh cấp huyện, nộp lệ phí (nếu có), và nhận giấy chứng nhận đăng ký hộ kinh doanh. Quy định, biểu mẫu và lệ phí cụ thể có thể thay đổi theo thời gian và địa phương — luôn xác nhận với cơ quan đăng ký kinh doanh hoặc chuyên viên tư vấn được cấp phép trước khi thực hiện, không dựa vào nội dung mẫu này.',
  },
  {
    title: '[SAMPLE - not official guidance] Hóa đơn và nghĩa vụ thuế, tổng quan chung',
    source: 'demo-placeholder',
    content:
      'Đây là nội dung mẫu (demo) dùng để kiểm thử tính năng search_knowledge_base, không phải hướng dẫn chính thức. Hộ kinh doanh tại Việt Nam nói chung có thể phát sinh nghĩa vụ thuế khi hoạt động, và doanh thu vượt một số ngưỡng nhất định có thể phát sinh thêm yêu cầu như hóa đơn điện tử. Ngưỡng, mức thuế và yêu cầu hóa đơn điện tử cụ thể thay đổi theo thời gian, ngành nghề và địa phương — luôn xác nhận quy định hiện hành với cơ quan thuế hoặc kế toán có chứng chỉ, không dựa vào nội dung mẫu này.',
  },
  {
    title: '[SAMPLE - not official guidance] "Chính thức hóa" nghĩa là gì trong chương trình này',
    source: 'demo-placeholder',
    content:
      'Đây là nội dung mẫu (demo) dùng để kiểm thử tính năng search_knowledge_base, không phải hướng dẫn chính thức. Trong chương trình Kế nghiệp số Gia Lai, "chính thức hóa" nói chung là việc một hộ kinh doanh chuyển từ hoạt động không đăng ký sang trạng thái đã đăng ký, tuân thủ thuế, thường được hỗ trợ bởi công cụ ghi chép số như SoloDesk. Đây chỉ là tóm tắt khái niệm chung, không phải danh sách các bước pháp lý.',
  },
  {
    title: '[SAMPLE - not official guidance] Dùng SoloDesk để ghi chép hàng ngày',
    source: 'demo-placeholder',
    content:
      'Đây là nội dung mẫu (demo) dùng để kiểm thử tính năng search_knowledge_base, không phải hướng dẫn chính thức. SoloDesk giúp hộ kinh doanh ghi lại đơn hàng bán, phiếu nhập hàng, hóa đơn và thanh toán ở một nơi, giúp việc chuẩn bị hồ sơ khi cơ quan thuế hoặc bên cho vay yêu cầu dễ dàng hơn. Bản thân công cụ không xác định nghĩa vụ pháp lý hay thuế phải nộp — điều đó phụ thuộc vào quy định mà nội dung mẫu này không đề cập.',
  },
];

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL is required — ingestion writes via the admin role, never solodesk_agent.');
  }
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is required to compute embeddings for ingestion.');
  }
  const baseUrl = process.env.VOYAGE_API_BASE_URL ?? 'https://api.voyageai.com/v1';
  const model = process.env.VOYAGE_EMBEDDING_MODEL ?? 'voyage-3.5';

  const sql = postgres(adminUrl, { max: 1 });
  try {
    for (const doc of SAMPLE_DOCUMENTS) {
      const embedding = await embedText(doc.content, { apiKey, baseUrl, model });
      await sql`
        INSERT INTO knowledge.chunks (title, content, source, embedding)
        VALUES (${doc.title}, ${doc.content}, ${doc.source}, ${JSON.stringify(embedding)}::vector)
      `;
      console.log(`Ingested: ${doc.title}`);
    }
    console.log(`Done — ${SAMPLE_DOCUMENTS.length} sample chunks ingested.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
