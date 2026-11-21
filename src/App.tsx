import { useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { AccountModal } from './components/AccountModal';
import { AppShell } from './components/AppShell';
import { ChatbotView } from './components/ChatbotView';
import { DashboardView } from './components/DashboardView';
import { PricingView } from './components/PricingView';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { TrackerView } from './components/TrackerView';
import { useBizBuddyStore } from './hooks/useBizBuddyStore';
import type { NavModule } from './lib/types';

function getInitialModule(): NavModule {
  if (typeof window === 'undefined') return 'tracker';
  const param = new URLSearchParams(window.location.search).get('tab');
  if (param === 'pricing' || param === 'dashboard' || param === 'chatbot' || param === 'tracker') {
    return param;
  }
  return 'tracker';
}

export default function App() {
  const {
    isAuthenticated,
    users,
    currentUser,
    setActiveUserId,
    products,
    transactions,
    chatMessages,
    syncNotice,
    addTransaction,
    deleteTransaction,
    upsertProduct,
    deleteProduct,
    appendChatMessages,
    addLocalChatTurn,
    clearChatThread,
    toggleChatMessageResolved,
    setUserPlan,
    updateShopProfile,
    resetDemoData,
  } = useBizBuddyStore();

  const [activeModule, setActiveModule] = useState<NavModule>(getInitialModule);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  return (
    <>
      <Analytics />
      <AppShell
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        currentUser={currentUser}
        isAuthenticated={isAuthenticated}
        onOpenQuickEntry={() => setQuickEntryOpen(true)}
        onOpenAccountModal={() => setAccountModalOpen(true)}
        syncNotice={syncNotice}
      >
      {activeModule === 'tracker' && (
        <TrackerView
          transactions={transactions}
          products={products}
          onOpenQuickEntry={() => setQuickEntryOpen(true)}
          onDeleteTransaction={deleteTransaction}
        />
      )}

      {activeModule === 'pricing' && (
        <PricingView
          products={products}
          onUpsertProduct={upsertProduct}
          onDeleteProduct={deleteProduct}
        />
      )}

      {activeModule === 'dashboard' && (
        <DashboardView
          shopName={currentUser.shop_name}
          plan={currentUser.plan}
          transactions={transactions}
          products={products}
          onUpgradePlan={() => setAccountModalOpen(true)}
        />
      )}

      {activeModule === 'chatbot' && (
        <ChatbotView
          userId={currentUser.id}
          shopName={currentUser.shop_name}
          category={currentUser.category}
          plan={currentUser.plan}
          products={products}
          transactions={transactions}
          chatMessages={chatMessages}
          onAppendMessages={appendChatMessages}
          onAddLocalTurn={addLocalChatTurn}
          onClearThread={clearChatThread}
          onToggleResolved={toggleChatMessageResolved}
        />
      )}

      <QuickEntrySheet
        open={quickEntryOpen}
        onClose={() => setQuickEntryOpen(false)}
        products={products}
        onSubmit={addTransaction}
      />

      <AccountModal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        users={users}
        currentUser={currentUser}
        isAuthenticated={isAuthenticated}
        onSelectUser={setActiveUserId}
        onSelectPlan={setUserPlan}
        onUpdateShopProfile={updateShopProfile}
        onResetDemoData={resetDemoData}
      />
    </AppShell>
    </>
  );
}
