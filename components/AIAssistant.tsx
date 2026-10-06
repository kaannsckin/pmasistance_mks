import React from 'react';
import AssistantChat from './assistant/AssistantChat';

/** Zekâ sekmesi: genel asistanın tam ekran görünümü (yan panelle aynı sohbet) */
const AIAssistant: React.FC<{ suggestions: { label: string; prompt: string }[] }> = ({ suggestions }) => (
  <div className="max-w-6xl mx-auto h-[calc(100vh-9rem)] rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
    <AssistantChat variant="page" suggestions={suggestions} />
  </div>
);

export default AIAssistant;
