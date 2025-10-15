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
