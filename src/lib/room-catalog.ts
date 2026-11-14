// Confirmed family room inventory. Room 5's possible extra bed is not bookable yet.
export const houseRooms = [
  { code: "ROOM-01", name: "Room 1", capacity: 2, notes: "Sea facing. Queen bed." },
  { code: "ROOM-02", name: "Room 2", capacity: 3, notes: "Sea facing. Queen bed and pull-out single." },
  { code: "ROOM-03", name: "Room 3", capacity: 3, notes: "Sea facing. Queen bed and pull-out single." },
  { code: "ROOM-04", name: "Room 4", capacity: 6, notes: "Queen bed, single bed and tri-bunk (single above a double)." },
  { code: "ROOM-05", name: "Room 5", capacity: 2, notes: "North facing. Two three-quarter beds. Possible pull-out single is NOT included in capacity until confirmed." },
  { code: "ROOM-06", name: "Room 6", capacity: 2, notes: "North facing. Queen bed." },
  { code: "ROOM-07", name: "Room 7", capacity: 5, notes: "Sea facing, old flat. Queen bed, bunk beds and pull-out single." }
] as const;
