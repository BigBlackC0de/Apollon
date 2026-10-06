import { AskChat } from "@/components/ask-chat";

export default function AskPage() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demander à Apollon</h1>
        <p className="text-sm text-ink-2">Claude répond en interrogeant la base (scrutins classifiés, positions, programmes, tweets) et cite les votes qu&apos;il utilise. Chaque question coûte quelques centimes.</p>
      </div>
      <AskChat />
    </div>
  );
}
