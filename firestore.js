// Local session persistence stub (no external backend)

export const saveData = async (text, score) => {
  console.log("Session analyzed locally", { text, score });
};
