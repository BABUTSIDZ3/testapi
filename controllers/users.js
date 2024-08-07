import express from "express";
import { queryDatabase } from "../utils/functions.js";

const usersRouter = express.Router();

usersRouter.get("/registered_users", async (req, res) => {
  const registeredUsersQuery = `SELECT id FROM users WHERE payment_status=1`;
  try {
    const result = await queryDatabase(registeredUsersQuery);

    // Extract ids into an array
    const userIds = result.map((user) => user.id);

    // Get the number of registered users
    const numberOfUsers = userIds.length;

    // Return the number in an array
    res.json([numberOfUsers]);
  } catch (error) {
    console.error("Error fetching registered users:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching registered users" });
  }
});

usersRouter.post("/delete-seen-questions", async (req, res) => {
  const { email } = req.body;
  const updatequerry = `UPDATE users SET seenquestions=? WHERE email=?`;
  await queryDatabase(updatequerry, ['"', email]);
  res.send("განულდა");
});

usersRouter.delete("/delete", async (req, res) => {
  const { email } = req.body;
  const deleteQuerry = `DELETE FROM users WHERE email =?`;
  await queryDatabase(deleteQuerry, [email]);
  res.send("succesfull");
});

usersRouter.post("/", async (req, res) => {
  const { token, language } = req.body;
  try {
    const sql_query = `SELECT * FROM users WHERE token = ?`;
    const notificationsQuerry = `SELECT date,notification_${
      language == "EN" ? "en" : "ge"
    } AS notification FROM notifications WHERE userId = ? OR userId = ?`;

    const data = await queryDatabase(sql_query, [token]);
    if (data[0]) {
      const notifications = await queryDatabase(notificationsQuerry, [
        data[0].id,"all",
      ]);
      const { email } = data[0];
      const transactionsQuerry = `
  SELECT 
    date,
    status,
    amount,
    ${
      language === "EN" ? "transaction_info_en" : "transaction_info_ge"
    } AS transaction_info 
  FROM 
    transactions 
  WHERE 
    user_email=?`;

      const transactions = await queryDatabase(transactionsQuerry, [email]);
      const response = {
        userData: data,
        transactions: transactions,
        notifications: notifications,
      };
      res.send(response);
    } else {
      res.send("user not found");
    }
  } catch (err) {
    res.send(err.message);
  }
});

usersRouter.get("/", async (req, res) => {
  const sql_query = `SELECT * FROM users`;
  const data = await queryDatabase(sql_query);
  res.send(data);
});

usersRouter.post("/subscription", async (req, res) => {
  const {email,language}=req.body
  const userQuerry = `SELECT balance FROM users WHERE email=?`
  const user = await queryDatabase(userQuerry,[email])
  if (user.balance<3){
res
  .status(403)
  .send(
    language == "EN"
      ? "You don't have enough balance to continue your subscription"
      : "თქვენ არ გაქვთ საკმარისი თანხა გამოწერის გასაგრძელებლად"
  );
  }else{
    const updatequerry = `UPDATE users SET subscription=?,balance=balance-3 WHERE email=?`;
    await queryDatabase(updatequerry, [1, email]);
    res.send(
      language == "EN"
        ? "You have successfully continued your subscription"
        : "თქვენ წარმატებით გააგრძელეთ გამოწერა"
    );
  }
});

usersRouter.post('/on-auto-sub',async(req,res)=>{
  const {email,language} =req.body
   const updatequerry = `UPDATE users SET auto_sub=? WHERE email=?`;
   await queryDatabase(updatequerry, [1,email])
res.send(
  language == "EN"
    ? "Automatic subscription has been successfully enabled"
    : "წარმატებით ჩაირთო ავტომატური გამოწერა"
);
})


usersRouter.post("/off-auto-sub", async (req, res) => {
  const { email, language } = req.body;
  const updatequerry = `UPDATE users SET auto_sub=? WHERE email=?`;
  await queryDatabase(updatequerry, [0, email]);
  res.send(
    language == "EN"
      ? "You have successfully turned off auto-subscription"
      : "წარმატებით გამოირთო ავტომატური გამოწერა"
  );
});



export default usersRouter;
