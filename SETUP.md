# Personal Finance Tracker - Setup Guide

## Overview
This is a React Native/Expo app that helps you track personal finances with AI-powered bank statement reading capabilities.

## Features
- 📸 **AI Bank Statement Reading**: Capture photos of bank statements and automatically extract transactions
- 💰 **Manual Transaction Entry**: Add transactions manually with categories
- 📊 **Dashboard**: View balance, income vs expenses, and spending by category
- 🔍 **Transaction Search**: Find transactions with powerful search and filters
- 📱 **Cross-platform**: Works on iOS, Android, and Web

## Quick Start

### 1. Install Dependencies
```bash
cd test
npm install
```

### 2. Set up OpenAI API (Optional)
For AI bank statement reading, you need an OpenAI API key:

1. Sign up at [OpenAI Platform](https://platform.openai.com/)
2. Create an API key
3. Create a `.env` file in the test directory:
```
EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
```

**Note**: Without an API key, the app will use mock data for demonstrations.

### 3. Start the Development Server
```bash
npx expo start
```

### 4. Test the App
- **Web**: Press `w` to open in browser
- **iOS**: Use Expo Go app or iOS Simulator
- **Android**: Use Expo Go app or Android Emulator

## App Structure

### Core Features
- **Home Tab**: Dashboard with balance, recent transactions, and quick actions
- **Profile Tab**: User settings and app information
- **Camera Screen**: Capture and process bank statements with AI
- **Transactions Screen**: View all transactions with search/filter
- **Add Transaction**: Manual transaction entry form

### Technology Stack
- **Frontend**: React Native with Expo
- **Database**: SQLite (local storage)
- **AI Processing**: OpenAI GPT-4 Vision API
- **Navigation**: Expo Router
- **UI Components**: Custom themed components with dark/light mode

## How to Use

### 1. Scan Bank Statement
1. Tap "Scan Statement" on the home screen
2. Point camera at bank statement
3. Take photo or select from gallery
4. AI will extract transactions automatically
5. Review and confirm extracted data

### 2. Add Manual Transaction
1. Tap "+" button or "Add Transaction"
2. Fill in amount, description, category, and date
3. Choose between income or expense
4. Save transaction

### 3. View Dashboard
- See current balance and monthly summary
- View top spending categories
- Quick access to recent transactions
- Navigate to detailed views

### 4. Manage Transactions
- View all transactions in list format
- Search by description or category
- Edit or delete transactions
- Filter by date, amount, or type

## Vietnamese Bank Statement Support

The AI is specifically trained to read Vietnamese bank statements including:
- Mobile banking screenshots
- ATM receipts
- Bank statement images
- Transaction notifications

Supported banks and formats:
- Vietcombank, Techcombank, BIDV, Vietinbank
- Mobile app screenshots
- SMS transaction notifications
- Online banking printouts

## Development

### File Structure
```
test/
├── app/                    # Screens and routes
│   ├── (tabs)/            # Tab navigation screens
│   ├── camera.tsx         # Camera/AI processing
│   ├── transactions.tsx   # Transaction list
│   └── add-transaction.tsx # Transaction form
├── components/            # Reusable UI components
├── lib/                   # Core functionality
│   ├── database.ts        # SQLite operations
│   └── openai.ts         # AI integration
├── types/                 # TypeScript definitions
└── constants/            # App configuration
```

### Adding Features
1. **New Screen**: Create in `app/` directory
2. **New Component**: Add to `components/`
3. **Database Changes**: Update `lib/database.ts`
4. **New Types**: Define in `types/`

## Troubleshooting

### Common Issues

**Camera not working:**
- Grant camera permissions
- Check device compatibility
- Try restarting the app

**AI processing fails:**
- Verify OpenAI API key is set
- Check internet connection
- Ensure image is clear and well-lit

**Database errors:**
- Clear app data and restart
- Check SQLite permissions
- Verify database initialization

**Build errors:**
- Run `npm install` to update dependencies
- Clear Expo cache: `npx expo start -c`
- Check for TypeScript errors

### Getting Help
1. Check the console for error messages
2. Verify all dependencies are installed
3. Ensure proper API key configuration
4. Test with mock data first

## License
This project is for educational and personal use.

## Contributing
Feel free to submit issues and feature requests!
