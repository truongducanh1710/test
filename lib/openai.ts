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
    try {
      // Convert image to base64
      const base64Image = await this.convertImageToBase64(imageUri);

      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
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
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      const transactions = this.parseAIResponse(content);
      return transactions;

    } catch (error) {
      console.error('Error extracting transactions from image:', error);
      throw new Error('Failed to process image. Please try again.');
    }
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
      const blob = await response.blob();
      
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
      throw new Error('Failed to convert image to base64');
    }
  }

  private static parseAIResponse(response: string): AIExtractedTransaction[] {
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
        throw new Error('Response is not an array');
      }

      // Validate each transaction
      return transactions.filter(transaction => this.validateTransaction(transaction));

    } catch (error) {
      console.error('Error parsing AI response:', error);
      throw new Error('Failed to parse AI response. Please try again.');
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
        model: "gpt-3.5-turbo",
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
        model: "gpt-3.5-turbo",
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
