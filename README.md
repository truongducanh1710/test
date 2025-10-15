# Personal Finance Tracker 💰

A smart React Native app that helps you track personal finances with AI-powered bank statement recognition.

## ✨ Features

- 📸 **AI Bank Statement Reading**: Take photos of Vietnamese bank statements and automatically extract transactions using OpenAI gpt-4o-mini
- 💰 **Manual Transaction Entry**: Add income and expenses manually with smart categorization
- 📊 **Financial Dashboard**: View balance, monthly summaries, spending categories, and trends
- 🔍 **Advanced Search**: Filter and search transactions by amount, date, category, or description  
- 🌙 **Dark/Light Mode**: Automatic theme switching based on system preferences
- 📱 **Cross-platform**: Works on iOS, Android, and Web

## 🚀 Quick Start

1. Install dependencies

   ```bash
   npm install
   ```

2. Set up OpenAI API (optional)
   
   Create a `.env` file:
   ```
   EXPO_PUBLIC_OPENAI_API_KEY=
   ```

3. Start the app

   ```bash
   npx expo start
   ```

4. Run on your device
   - **Web**: Press `w` to open in browser
   - **iOS**: Use Expo Go app or iOS Simulator  
   - **Android**: Use Expo Go app or Android Emulator

> **Note**: Without an OpenAI API key, the app uses mock data for AI demonstrations.

## 📖 How to Use

### Scan Bank Statement
1. Tap "Quét Sao Kê" on the home screen
2. Point camera at your Vietnamese bank statement  
3. Take photo or select from gallery
4. AI extracts transactions automatically
5. Review and save to your database

### Manual Entry  
1. Tap "Thêm Giao Dịch" 
2. Enter amount, description, and category
3. Choose income or expense type
4. Select date and save

### View Analytics
- Check your dashboard for spending insights
- Browse transaction history with search/filter
- View spending by category and trends

## 🏗️ Tech Stack

- **React Native + Expo**: Cross-platform mobile development
- **SQLite**: Local database for transaction storage  
- **OpenAI gpt-4o-mini**: AI-powered Vietnamese text extraction
- **TypeScript**: Type-safe development
- **Expo Router**: File-based navigation

## 📄 Documentation

For detailed setup instructions and troubleshooting, see [SETUP.md](./SETUP.md).

## 🇻🇳 Vietnamese Support

This app is specifically designed for Vietnamese users with:
- Full Vietnamese localization
- Support for major Vietnamese banks (VCB, TCB, BIDV, VietinBank)
- Vietnamese currency formatting (VND)
- AI trained on Vietnamese bank statement formats
