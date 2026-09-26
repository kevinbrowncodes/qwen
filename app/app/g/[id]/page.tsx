import { GenerationPage } from "@/components/generation/GenerationPage";

type Props = { readonly params: Promise<{ readonly id: string }> };

/** /g/<id>: one generation, reopened by its id (STORY_012). */
export default async function Generation({ params }: Props) {
  const { id } = await params;
  return <GenerationPage key={id} id={decodeURIComponent(id)} />;
}
