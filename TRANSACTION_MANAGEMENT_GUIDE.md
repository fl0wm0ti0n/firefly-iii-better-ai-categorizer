# Transaction Management Guide - Drag & Drop Interface

Complete guide to the interactive drag & drop transaction management system for efficient categorization and processing of Firefly III transactions.

## 🐳 Docker Access Information

**Container Setup Access:**
- **Web Interface URL**: `http://localhost:3001` (when using docker-compose)
- **Container Network**: Accessible via `firefly-ai-network`
- **Health Check**: Built-in container health monitoring
- **Logs**: Monitor real-time with `docker-compose logs -f firefly-ai-categorizer`

**Port Configuration:**
```yaml
# docker-compose.yml
ports:
  - "3001:3000"  # host:container
```

**Volume Persistence:**
- Transaction data persists through container restarts
- Configuration files mounted as volumes
- Failed transactions saved in `./failed-transactions.json`

For Docker setup instructions, see **[DOCKER_GUIDE.md](DOCKER_GUIDE.md)**.

---

## 🎯 Overview

The **Transaction Management Interface** provides a powerful, interactive way to browse, filter, and categorize your Firefly III transactions with **Drag & Drop functionality**. This modern interface combines advanced filtering with intuitive mouse-based categorization.

## 🖱️ Drag & Drop Categorization

### **Visual Interface**
- **Drag Handle**: Each transaction shows a `⋮⋮` handle on hover
- **Category Grid**: Appears automatically when dragging transactions
- **Drop Zones**: Visual feedback for valid/invalid drop operations
- **Toast Notifications**: Instant feedback for all operations

### **Three Ways to Categorize**

#### **1. Direct Category Assignment** 📁
```
Drag Transaction → Drop on Category Zone
Example: Drag "Amazon Purchase" → Drop on "📁 Shopping"
Result: Transaction categorized as "Shopping"
```

#### **2. Cross-Column Operations** ↔️
```
Left Column (Uncategorized) ←→ Right Column (Categorized)
- Drag to Left = Remove Category
- Drag to Right = Assign Current View Category
```

#### **3. Category Removal** ❌
```
Drag Transaction → Drop on "❌ Remove Category" Zone
Result: Category removed from transaction
```

### **How Drag & Drop Works**

1. **Start Dragging**: Hover over transaction → drag handle appears → start dragging
2. **Category Grid Appears**: All available categories displayed as drop zones
3. **Visual Feedback**: 
   - Valid drops: Green border, "Drop here" message
   - Invalid drops: Red border, warning message
4. **Drop & Confirm**: Drop on target → instant categorization → toast notification
5. **Auto-Refresh**: Lists update automatically after successful operations

## 💻 Interface Layout

### **Filter Section** 🔍
```
┌─────────────────────────────────────────────────────────┐
│ Transaction Type │ Category Filter │ Specific Category  │
├─────────────────────────────────────────────────────────┤
│ Search Text      │ Date From       │ Date To            │
├─────────────────────────────────────────────────────────┤
│ Min Amount       │ Max Amount      │                    │
└─────────────────────────────────────────────────────────┘
```

### **Two-Column Layout** 📊
```
┌────────────────────┬────────────────────┐
│ Left Column        │ Right Column       │
│ ==================│ ==================│
│ Uncategorized/     │ Categorized        │
│ Filtered Results   │ Transactions       │
│                   │                    │
│ □ Select All      │ □ Select All       │
│ [Category v] ➡️   │ [Category v] 🔄 ❌ │
│                   │                    │
│ 🖱️ Transaction 1  │ 🖱️ Transaction A   │
│ 🖱️ Transaction 2  │ 🖱️ Transaction B   │
│ 🖱️ Transaction 3  │ 🖱️ Transaction C   │
└────────────────────┴────────────────────┘
```

### **Category Grid** (During Drag) 🎯
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Remove Category  │ 📁 Groceries    │ 📁 Transportation │
├─────────────────────────────────────────────────────────┤
│ 📁 Entertainment   │ 📁 Healthcare   │ 📁 Shopping       │
├─────────────────────────────────────────────────────────┤
│ 📁 Travel & Foreign│ 📁 Utilities    │ 📁 Restaurants    │
└─────────────────────────────────────────────────────────┘
```

## 🎮 Step-by-Step Usage

### **Step 1: Set Up Filters** ⚙️
1. **Transaction Type**: Choose from All, Withdrawals, Deposits, or Uncategorized
2. **Category Filter**: Filter by category status (All, Has Category, No Category)
3. **Specific Category**: Select a particular category to focus on
4. **Search Text**: Enter keywords to search in description/destination
5. **Date Range**: Set from/to dates (defaults to current month)
6. **Amount Range**: Set minimum and maximum amounts
7. **Click "🔍 Load Transactions"**

### **Step 2: Use Drag & Drop** 🖱️

#### **Categorize Single Transaction**
1. **Hover** over any transaction in the left column
2. **Drag handle `⋮⋮`** appears on the left side
3. **Start dragging** the transaction
4. **Category grid appears** below the columns
5. **Drop on target category** (e.g., "📁 Groceries")
6. **Toast notification** confirms success: "✅ Transaction categorized as 'Groceries'"
7. **Lists auto-refresh** to reflect changes

#### **Remove Category**
1. **Drag** a categorized transaction from either column
2. **Drop on "❌ Remove Category"** zone (red zone)
3. **Confirmation**: "✅ Category removed from transaction"

#### **Cross-Column Operations**
1. **Right Column Setup**: Select a category in "View all categories..." dropdown
2. **Drag from Left to Right**: Assigns the currently viewed category
3. **Drag from Right to Left**: Removes category from transaction

### **Step 3: Bulk Operations** 📦
1. **Select Multiple**: Use checkboxes to select multiple transactions
2. **Left Column Actions**:
   - Choose category from dropdown
   - Click "➡️ Assign Category"
3. **Right Column Actions**:
   - Choose new category: "🔄 Reassign" 
   - Remove categories: "❌ Remove Category"

### **Step 4: Monitor & Manage** 📊
- **Transaction Count**: Shows number of loaded transactions
- **Selection Counter**: Buttons show selected count (e.g., "☑️ Selected (5)")
- **Real-time Updates**: All changes reflect immediately
- **Clear Filters**: Reset all filters to start fresh

## 🎯 Advanced Features

### **Smart Drop Validation** 🧠
- **Prevents Invalid Operations**: Cannot assign same category twice
- **Visual Feedback**: Green for valid, red for invalid drops
- **Context Awareness**: Understands source and target contexts

### **Multi-Category Grid** 📋
- **Dynamic Layout**: Responsive grid adapts to screen size
- **All Categories**: Shows all available Firefly III categories
- **Visual Distinction**: Remove zone in red, categories with folder icons
- **Hover Effects**: Clear visual feedback for drop targets

### **Toast Notifications** 💬
```
✅ Success: "Transaction categorized as 'Groceries'"
⚠️ Warning: "Cannot assign same category"
❌ Error: "Failed to update transaction"
ℹ️ Info: "Transaction already has no category"
```

### **Real-time Updates** ⚡
- **Auto-Refresh**: Lists update after every change
- **Socket.io Integration**: Real-time updates across multiple browser tabs
- **State Preservation**: Filters and selections maintained during updates

## 🎨 Visual Design Elements

### **Transaction Cards** 💳
```
┌─────────────────────────────────────────────────────────┐
│ ⋮⋮ ☑️ Amazon Purchase                    -€45.99 EUR   │
│      📍 Amazon.com                                      │
│      withdrawal  Groceries  2024-01-15                 │
└─────────────────────────────────────────────────────────┘
```

### **Drag States** 🎭
- **Normal**: Clean card design with hover effects
- **Dragging**: Semi-transparent with rotation effect
- **Drop Target**: Highlighted borders and backgrounds
- **Processing**: Loading state during API calls

### **Category Zones** 🎯
```
┌─────────────────────┐  ┌─────────────────────┐
│ ❌ Remove Category  │  │ 📁 Groceries        │
│ (Red Border)        │  │ (Blue Border)       │
└─────────────────────┘  └─────────────────────┘
     ↓ Hover Effect         ↓ Hover Effect
┌─────────────────────┐  ┌─────────────────────┐
│ ❌ Remove Category  │  │ 📁 Groceries        │
│ (Bright Red + Scale)│  │ (Bright Blue + Scale)│
└─────────────────────┘  └─────────────────────┘
```

## 🔧 Technical Features

### **Performance Optimizations** ⚡
- **Efficient Rendering**: Only re-renders changed transactions
- **Debounced API Calls**: Prevents excessive server requests
- **Smart Caching**: Reduces redundant data fetches
- **Lazy Loading**: Loads transaction details on demand

### **Error Handling** 🛡️
- **API Error Recovery**: Graceful handling of server errors
- **Network Issues**: Retry logic with exponential backoff
- **User Feedback**: Clear error messages and recovery suggestions
- **State Consistency**: Ensures UI remains in sync with server

### **Accessibility** ♿
- **Keyboard Navigation**: Full keyboard support for all operations
- **Screen Reader Support**: Proper ARIA labels and descriptions
- **High Contrast**: Clear visual distinctions for all states
- **Touch Friendly**: Works on tablets and touch devices

## 💡 Best Practices

### **Efficient Workflows** 🚀

#### **Daily Categorization**
1. **Filter**: Set to "Uncategorized Only"
2. **Load**: Recent transactions appear
3. **Drag & Drop**: Quick categorization of new transactions
4. **Bulk**: Select multiple similar transactions for batch processing

#### **Category Cleanup**
1. **Filter**: Select specific category in right column
2. **Review**: Check all transactions in that category
3. **Reorganize**: Drag incorrect transactions to proper categories
4. **Bulk Reassign**: Select multiple for category changes

#### **Monthly Review**
1. **Date Filter**: Set to previous month
2. **Type Filter**: Focus on withdrawals/deposits separately
3. **Category Review**: Use right column to audit each category
4. **Corrections**: Fix any miscategorized transactions

### **Drag & Drop Tips** 🎯

#### **Visual Cues**
- **Green = Good**: Valid drop operation
- **Red = Stop**: Invalid operation
- **Scale Effect**: Indicates active drop zone
- **Rotation**: Shows item being dragged

#### **Efficient Techniques**
- **Hover First**: Let drag handle appear before dragging
- **Smooth Movements**: Drag steadily for better visual feedback
- **Drop Precisely**: Target center of category zones
- **Watch Notifications**: Confirm success before next operation

### **Filter Strategies** 🔍

#### **Finding Uncategorized**
```
Type: Uncategorized Only
Category: No Category
Date: Current Month
→ Shows all recent uncategorized transactions
```

#### **Category Audit**
```
Type: All Transactions
Category: Has Category
Specific Category: [Target Category]
→ Review all transactions in specific category
```

#### **Amount-Based Review**
```
Type: Withdrawals
Min Amount: 100.00
Date: Last 3 months
→ Focus on larger expenses for accuracy
```

## 🎉 Benefits

### **Speed & Efficiency** ⚡
- **Visual Operation**: Drag & drop is faster than dropdown selection
- **Batch Processing**: Handle multiple transactions simultaneously
- **Smart Filters**: Find exactly what you need quickly
- **Auto-Refresh**: No manual page reloading needed

### **User Experience** 😊
- **Intuitive Design**: Natural mouse-based interaction
- **Immediate Feedback**: See results instantly
- **Error Prevention**: Visual validation prevents mistakes
- **Flexible Workflow**: Multiple ways to achieve same result

### **Accuracy & Control** 🎯
- **Visual Confirmation**: See categories before dropping
- **Undo Capability**: Easy to reverse categorization mistakes
- **Bulk Operations**: Consistent categorization across similar transactions
- **Real-time Validation**: Prevents invalid operations

## 🔄 Integration with Other Features

### **Works with Auto-Categorization** 🤖
- **Review Auto-Results**: Check AI categorization results
- **Manual Override**: Easily correct auto-categorized transactions
- **Mixed Processing**: Combine automatic and manual categorization

### **Complements Batch Processing** 📦
- **Post-Batch Review**: Clean up batch processing results
- **Selective Processing**: Handle edge cases after bulk operations
- **Quality Control**: Verify batch results with visual interface

### **Enhances Category Mappings** 🗂️
- **Rule Testing**: See how category mappings perform
- **Gap Identification**: Find patterns that need new rules
- **Quick Fixes**: Handle exceptions that rules missed

## 🚀 Getting Started

### **Quick Start Guide**
1. **Navigate** to "Transaction Management (Interactive)"
2. **Click** "🔍 Load Transactions" (uses current month by default)
3. **Find** an uncategorized transaction
4. **Hover** to see drag handle `⋮⋮`
5. **Drag** to category grid that appears
6. **Drop** on appropriate category
7. **Enjoy** the instant categorization! 🎉

This interface transforms transaction management from a tedious task into an **engaging, efficient, and enjoyable experience**! 🎯✨ 