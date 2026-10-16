/**
 * The body of a LoRA's info card (STORY_030, ours: the reference has no LoRAs): what the creator says it was made for,
 * what is known of each subject (the creator's claim and the bench), and the facts. The Dropdown draws the header and
 * the pick button around it. All wording comes from lib/lora-card.ts.
 */
import type { LoraInfo } from "@/lib/composer-state";
import { loraCard } from "@/lib/lora-card";

export function LoraCard({ info }: { readonly info: LoraInfo }) {
  const card = loraCard(info);
  return (
    <div className="clone-lora-card" data-testid="lora-card">
      {card.madeFor === null ? null : (
        <section className="clone-lora-card-section">
          <h3 className="clone-lora-card-heading">Made for</h3>
          <p className="clone-lora-card-text">{card.madeFor}</p>
        </section>
      )}
      {card.abilities.length === 0 ? null : (
        <section className="clone-lora-card-section">
          <h3 className="clone-lora-card-heading">Capabilities</h3>
          {card.abilities.map((a) => (
            <div key={a.subject} className="clone-lora-card-ability" data-testid="lora-ability">
              <div className="clone-lora-card-subject">{a.subject}</div>
              <dl className="clone-lora-card-pairs">
                <dt>Claimed</dt>
                <dd>{a.claimed}</dd>
                <dt>Bench</dt>
                <dd>{a.bench}</dd>
              </dl>
            </div>
          ))}
          {card.benchNote === null ? null : <p className="clone-lora-card-note">{`Bench: ${card.benchNote}`}</p>}
        </section>
      )}
      <dl className="clone-lora-card-section clone-lora-card-facts">
        {card.facts.map((f) => (
          <div key={f.key} className="clone-lora-card-fact" data-testid={`lora-fact-${f.key}`}>
            <dt>{f.label}</dt>
            <dd>
              {f.href === undefined ? (
                f.value
              ) : (
                <a href={f.href} target="_blank" rel="noopener noreferrer" title={f.title}>
                  {f.value} ↗
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
