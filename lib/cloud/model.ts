import { indexPiece, type Store, type Piece } from "../writing";
const contentKey = (paper: Piece) =>
  JSON.stringify({
    ...paper.document,
    cursor: 0,
    selection: undefined,
    pendingBlock: undefined,
    typingStyle: undefined,
  });
// Switching combines papers. Conflicting versions become separate filed papers;
// neither version is silently replaced by the storage selector.
export function combineDesks(local: Store, cloud: Store): Store {
  const papers = [local.active, ...local.pieces];
  const existing = new Map(papers.map((p) => [p.id, p]));
  const additions: Piece[] = [];
  for (const paper of [cloud.active, ...cloud.pieces]) {
    const same = existing.get(paper.id);
    if (same && papers.some((saved) => contentKey(saved) === contentKey(paper)))
      continue;
    if (!same && !paper.document.title && !paper.document.marks.length)
      continue;
    additions.push(
      indexPiece({
        ...paper,
        id: same ? crypto.randomUUID() : paper.id,
        torn: paper.torn ?? paper.created,
        eventsLoaded: true,
      }),
    );
  }
  return { ...local, pieces: [...local.pieces, ...additions] };
}
