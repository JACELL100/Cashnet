'use client';

import dynamic from 'next/dynamic';

const VoiceAgent = dynamic(() => import('./VoiceAgent'), { ssr: false });

export default function VoiceAgentWrapper() {
  return <VoiceAgent />;
}
