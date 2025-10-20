import OpenAI from 'openai';
import { Transaction } from './database';

// You'll need to set your OpenAI API key in environment variables
// For development, you can create a .env file with EXPO_PUBLIC_OPENAI_API_KEY=your_key_here
const openai = new OpenAI({
  apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
});

export interface AIExtractedTransaction {
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  confidence: number; // 0-1, confidence level of the extraction
}

export class OpenAIService {
  static async extractTransactionsFromImage(imageUri: string): Promise<AIExtractedTransaction[]> {
    return await this.retryWithBackoff(async () => {
      try {
        // Convert image to base64 with size optimization
        const base64Image = await this.convertImageToBase64(imageUri);

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: this.createVietnameseBankStatementPrompt(),
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 2000,
          temperature: 0.1, // Low temperature for more consistent results
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('Không nhận được phản hồi từ OpenAI');
        }

        // Parse and validate the JSON response
        const transactions = this.safeParseTransactions(content);
        return transactions;

      } catch (error: any) {
        console.error('Error extracting transactions from image:', error);
        
        // More specific error messages
        if (error.message?.includes('API key')) {
          throw new Error('Khóa API OpenAI không hợp lệ. Vui lòng kiểm tra cấu hình.');
        } else if (error.message?.includes('quota')) {
          throw new Error('Đã vượt quá giới hạn API OpenAI. Vui lòng thử lại sau.');
        } else if (error.message?.includes('rate limit')) {
          throw new Error('Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.');
        }
        
        throw new Error('Không thể xử lý ảnh. Vui lòng thử lại hoặc chọn ảnh khác.');
      }
    });
  }

  private static createVietnameseBankStatementPrompt(): string {
    return `
Bạn là một AI chuyên phân tích sao kê ngân hàng Việt Nam. Hãy đọc ảnh sao kê này và trích xuất tất cả các giao dịch.

Yêu cầu:
1. Chỉ trả về JSON array, không có text thêm
2. Mỗi giao dịch phải có format:
{
  "amount": số tiền (số dương, không có dấu phẩy),
  "description": "mô tả giao dịch",
  "date": "YYYY-MM-DD",
  "type": "income" hoặc "expense",
  "confidence": số từ 0.0 đến 1.0
}

Lưu ý:
- amount luôn là số dương
- type = "expense" nếu là chi tiêu (tiền ra), "income" nếu là thu nhập (tiền vào)
- date format ISO: YYYY-MM-DD
- description giữ nguyên tiếng Việt, loại bỏ mã giao dịch phức tạp
- confidence: 1.0 nếu rất chắc chắn, 0.8-0.9 nếu khá chắc, dưới 0.8 nếu không chắc

Ví dụ response:
[
  {
    "amount": 50000,
    "description": "Mua bánh chó chi lú",
    "date": "2025-01-15",
    "type": "expense",
    "confidence": 0.95
  },
  {
    "amount": 1000000,
    "description": "Chuyển khoản từ Anh Mạnh",
    "date": "2025-01-15", 
    "type": "income",
    "confidence": 0.9
  }
]

Chỉ trả về JSON array, không có text khác.
    `;
  }

  private static async convertImageToBase64(imageUri: string): Promise<string> {
    try {
      const response = await fetch(imageUri);
      let blob = await response.blob();
      
      // Check if image is too large (> 5MB) and compress if needed
      if (blob.size > 5 * 1024 * 1024) {
        blob = await this.compressImage(blob);
      }
      
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64String = reader.result as string;
          // Remove the data:image/jpeg;base64, prefix
          const base64Data = base64String.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      throw new Error('Không thể chuyển đổi ảnh sang base64');
    }
  }

  private static async compressImage(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions (max 1920x1080)
        let { width, height } = img;
        const maxWidth = 1920;
        const maxHeight = 1080;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = width * ratio;
          height = height * ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw and compress
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (compressedBlob) => {
            if (compressedBlob) {
              resolve(compressedBlob);
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/jpeg',
          0.8 // 80% quality
        );
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  private static async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 2,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on certain errors
        if (
          error.message?.includes('API key') ||
          error.message?.includes('quota') ||
          attempt === maxRetries
        ) {
          throw error;
        }
        
        // Wait before retrying with exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Thử lại sau ${delay}ms... (lần thử ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  private static safeParseTransactions(response: string): AIExtractedTransaction[] {
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/```$/, '');
      }

      const transactions = JSON.parse(cleanResponse);
      
      if (!Array.isArray(transactions)) {
        throw new Error('Phản hồi không phải là mảng giao dịch');
      }

      // Validate and normalize each transaction
      const validTransactions = transactions
        .map(transaction => this.normalizeTransaction(transaction))
        .filter(transaction => transaction !== null) as AIExtractedTransaction[];
      
      if (validTransactions.length === 0) {
        throw new Error('Không tìm thấy giao dịch hợp lệ trong ảnh');
      }

      return validTransactions;

    } catch (error) {
      console.error('Error parsing AI response:', error);
      
      // Try fallback parsing methods
      const fallbackTransactions = this.tryFallbackParsing(response);
      if (fallbackTransactions.length > 0) {
        return fallbackTransactions;
      }
      
      throw new Error('Không thể phân tích phản hồi từ AI. Vui lòng thử lại với ảnh rõ hơn.');
    }
  }

  private static normalizeTransaction(transaction: any): AIExtractedTransaction | null {
    try {
      // Validate required fields
      if (!transaction || typeof transaction !== 'object') {
        return null;
      }

      // Normalize amount - convert string to number if needed
      let amount = transaction.amount;
      if (typeof amount === 'string') {
        amount = parseFloat(amount.replace(/[,\.]/g, ''));
      }
      if (!amount || amount <= 0) {
        return null;
      }

      // Validate description
      const description = transaction.description?.trim();
      if (!description || description.length === 0) {
        return null;
      }

      // Normalize date to YYYY-MM-DD format
      let date = transaction.date;
      if (typeof date === 'string') {
        // Try to parse various date formats
        const dateMatch = date.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (dateMatch) {
          const [, day, month, year] = dateMatch;
          date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          // If date format is invalid, use current date
          date = new Date().toISOString().split('T')[0];
        }
      }

      // Normalize type
      let type = transaction.type;
      if (type !== 'income' && type !== 'expense') {
        // Try to infer from keywords or amount sign
        if (amount < 0 || description.toLowerCase().includes('chi') || description.toLowerCase().includes('rút')) {
          type = 'expense';
          amount = Math.abs(amount);
        } else {
          type = 'expense'; // Default to expense for bank statements
        }
      }

      // Normalize confidence
      let confidence = transaction.confidence || 0.8;
      if (confidence > 1) confidence = 1;
      if (confidence < 0) confidence = 0;

      return {
        amount,
        description,
        date,
        type,
        confidence
      };

    } catch (error) {
      console.error('Error normalizing transaction:', error);
      return null;
    }
  }

  private static tryFallbackParsing(response: string): AIExtractedTransaction[] {
    try {
      // Try to extract JSON-like patterns from the response
      const jsonPattern = /\{[^{}]*"amount"[^{}]*\}/g;
      const matches = response.match(jsonPattern) || [];
      
      const transactions: AIExtractedTransaction[] = [];
      for (const match of matches) {
        try {
          const transaction = JSON.parse(match);
          const normalized = this.normalizeTransaction(transaction);
          if (normalized) {
            transactions.push(normalized);
          }
        } catch (error) {
          // Skip invalid JSON blocks
          continue;
        }
      }
      
      return transactions;
    } catch (error) {
      console.error('Fallback parsing failed:', error);
      return [];
    }
  }

  private static validateTransaction(transaction: any): boolean {
    return (
      typeof transaction.amount === 'number' &&
      transaction.amount > 0 &&
      typeof transaction.description === 'string' &&
      transaction.description.length > 0 &&
      typeof transaction.date === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(transaction.date) &&
      (transaction.type === 'income' || transaction.type === 'expense') &&
      typeof transaction.confidence === 'number' &&
      transaction.confidence >= 0 &&
      transaction.confidence <= 1
    );
  }

  // Helper method to test API key
  static async testConnection(): Promise<boolean> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 5,
      });

      return !!response.choices[0]?.message?.content;
    } catch (error) {
      console.error('OpenAI connection test failed:', error);
      return false;
    }
  }

  // Method to improve description using AI
  static async improveTransactionDescription(description: string): Promise<string> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Bạn là trợ lý tài chính. Hãy viết lại mô tả giao dịch cho ngắn gọn, dễ hiểu hơn nhưng vẫn giữ đủ thông tin quan trọng. Chỉ trả về mô tả đã cải thiện, không có text thêm."
          },
          {
            role: "user",
            content: `Cải thiện mô tả này: "${description}"`
          }
        ],
        max_tokens: 100,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content?.trim() || description;
    } catch (error) {
      console.error('Error improving description:', error);
      return description; // Return original if improvement fails
    }
  }
}

// Helper function to check if OpenAI API key is configured
export const isOpenAIConfigured = (): boolean => {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  return !!apiKey && apiKey.length > 0;
};

// Mock data for testing when API key is not available
export const getMockTransactions = (): AIExtractedTransaction[] => {
  return [
    {
      amount: 50000,
      description: "Mua bánh chó chi lú",
      date: "2025-01-15",
      type: "expense",
      confidence: 0.95
    },
    {
      amount: 240000,
      description: "Chuyển khoản MB Bank",
      date: "2025-01-15",
      type: "expense", 
      confidence: 0.9
    },
    {
      amount: 1000000,
      description: "Chuyển khoản từ Anh Mạnh",
      date: "2025-01-15",
      type: "income",
      confidence: 0.85
    }
  ];
};

// --------- Finance Chat (Guardrailed) ---------
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatFinance(messages: ChatMessage[], context: any): Promise<string> {
  // Personality prompt from settings
  let personalityBlock = '';
  try {
    const { getPersonalitySettings } = await import('@/lib/settings');
    const pers = await getPersonalitySettings();
    if (pers?.enabled) {
      const tone =
        pers.style === 'serious' ? 'giọng nghiêm túc, chuẩn mực, súc tích' :
        pers.style === 'humor' ? 'giọng hài hước, nhẹ nhàng nhưng đúng trọng tâm' :
        pers.style === 'custom_angry' ? 'giọng nghiêm khắc, thẳng thắn, không vòng vo (nhưng không thô lỗ)' :
        'giọng “mắng yêu” kiểu bạn thân: thẳng mà ấm, có chút dí dỏm';
      const intensity =
        pers.intensity === 'hard' ? 'mức độ nhắc nhở cứng, phê bình rõ ràng, luôn đề xuất giải pháp cắt giảm ngay' :
        pers.intensity === 'light' ? 'mức độ nhẹ nhàng, tập trung gợi ý tích cực' :
        'mức độ vừa phải, cân bằng giữa nhắc nhở và động viên';
      const styleRules = [
        'Không dùng chữ in đậm (bold) trong phản hồi',
        'Phản hồi NGẮN: tối đa 3 dòng hoặc 3 bullet ngắn',
        'Dùng emoji phù hợp (tối đa 2) để tăng cảm xúc',
        'Một thái độ rõ ràng; mở đầu trực diện, không vòng vo',
        'Chi bất thường/vượt ngân sách: mắng yêu thẳng, kèm 1-2 giải pháp cụ thể',
        'Tiết kiệm tốt: khen ngay, khuyến khích duy trì',
        'Bất khả kháng: hỏi thăm trước rồi gợi ý cân đối lại',
        'Tránh lặp lại số liệu thừa; ưu tiên con số quan trọng nhất',
        'Không dùng từ đã được yêu cầu bỏ',
      ].join('; ');
      personalityBlock = `Giọng điệu: ${tone}. Cường độ: ${intensity}. Quy tắc: ${styleRules}. \n`;
    }
  } catch {}

  const system = `Bạn là trợ lý tài chính cá nhân, trả lời bằng tiếng Việt.\n` +
    `Giới hạn: chỉ trả lời về tài chính/ngân sách/giao dịch/tiết kiệm.\n` +
    `Nếu câu hỏi ngoài phạm vi, lịch sự từ chối và hướng lại chủ đề tài chính.\n` +
    `Khi đưa lời khuyên, dựa trên số liệu 90 ngày gần nhất trong context.\n` +
    `Không dùng chữ in đậm (bold) trong phản hồi.\n` +
    `Nếu người dùng nhập dạng giao dịch ngắn (ví dụ: \'20k cà phê\'), hãy phản hồi 1-3 dòng theo giọng đã chọn: nhắc nhở/khen/hỏi thăm + 1-2 gợi ý thực hành.\n` +
    `Trả lời ngắn gọn, ưu tiên gạch đầu dòng khi phù hợp.\n` +
    personalityBlock;

  if (!isOpenAIConfigured()) {
    try {
      const { totals, byCat, loans } = context || {};
      const n = new Intl.NumberFormat('vi-VN');
      const lines: string[] = [];
      if (totals) {
        lines.push(`Tổng 90 ngày: Thu ${n.format(totals.income || 0)} ₫, Chi ${n.format(totals.expense || 0)} ₫.`);
      }
      if (Array.isArray(byCat) && byCat.length) {
        const top = byCat.slice(0, 3).map((c: any) => `${c.category}: ${n.format(c.total)} ₫`).join('; ');
        lines.push(`Top chi tiêu: ${top}.`);
      }
      if (loans && (loans.openCount || loans.dueSoon)) {
        lines.push(`Khoản vay/cho vay đang mở: ${loans.openCount || 0}, sắp đến hạn trong 3 ngày: ${loans.dueSoon || 0}.`);
      }
      lines.push(`(Bản tóm tắt cục bộ — thêm API key để nhận tư vấn chi tiết hơn).`);
      return lines.join('\n');
    } catch {
      return 'Chưa cấu hình API key. Vào Cài đặt để thêm khóa OpenAI.';
    }
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'system', content: `DỮ LIỆU 90 NGÀY:\n${JSON.stringify(context).slice(0, 5000)}` },
      ...messages,
    ],
    max_tokens: 800,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

// Lightweight classifier: determine if a text expresses spending/income input
export async function isTransactionIntent(text: string): Promise<boolean> {
  const quickHeuristic = () => {
    const s = text.toLowerCase();
    // Obvious non-transaction intents
    const nonIntents = ['tóm tắt', 'tối ưu', 'gợi ý', 'cảnh báo', 'điểm đáng chú ý', 'báo cáo', 'thống kê'];
    if (nonIntents.some(k => s.includes(k))) return false;
    // Money marker near numbers
    const money = /(\d+([\.,]\d+)?\s*(đ|₫|vnd|vnđ|k|ngàn|nghìn|triệu|trieu|tr|m))|(([$€]|usd|eur)\s*\d+([\.,]\d+)?)/i;
    return money.test(s);
  };

  if (!isOpenAIConfigured()) return quickHeuristic();

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 3,
      messages: [
        { role: 'system', content: 'You are a classifier. Reply exactly "yes" if the user text is entering spending/income transactions (like amounts with categories/descriptions or short notes to be saved as transactions). Reply "no" otherwise (questions like summarize, optimize, warning, etc.). Language may be Vietnamese or English.' },
        { role: 'user', content: text }
      ]
    });
    const out = resp.choices[0]?.message?.content?.trim().toLowerCase() || '';
    return out.startsWith('y');
  } catch {
    return quickHeuristic();
  }
}
