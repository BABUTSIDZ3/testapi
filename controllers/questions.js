import express from "express";
import { queryDatabase } from "../utils/functions.js";

const questionsRouter = express.Router();

questionsRouter.post("/active", async (req, res) => {
  const gameIsStartedQuery = `SELECT started_game FROM admin`;
  const [gameStatus] = await queryDatabase(gameIsStartedQuery);
   const { user_id, usingHelp, language } = req.body;
  if (gameStatus.started_game == 1) {
    try {
   

      // Retrieve the user's health from the database
      const getUserHealthQuery = `SELECT health,subscription FROM users WHERE id = ?`;
      const [userHealthResult] = await queryDatabase(getUserHealthQuery, [
        user_id,
      ]);
      if (userHealthResult?.subscription < 1) {
        res
          .status(402)
          .send(
            language == "EN"
              ? "Your subscription has been suspended and you will not be able to continue playing"
              : "თქვენ შეჩერებულია გაქვთ გამოწერა და ვერ შეძლებთ თამაშის გაგრძელებას"
          );
        return;
      }

      if (userHealthResult?.health < 1) {
        res
          .status(403)
          .send(
            language == "EN"
              ? "Your health is too low to perform any actions, do you want to buy?"
              : "თქვენ არ გაქვთ სიცოცხლე და ვერ შეძლებთ თამაშის გაგრძელებას, გნებავთ შეიძინოთ?"
          );
        return;
      }

      const getUserHelpQuery = `SELECT help FROM users WHERE id = ?`;
      const [userHelpResult] = await queryDatabase(getUserHelpQuery, [user_id]);

      if (usingHelp == 1 && userHelpResult.help < 1) {
        res.status(403).send(language=="EN"?"You don't have enough help cards to use help, do you want to buy?":"თქვენ არ გაქვთ დახმარების ქარდი, გნებავთ შეიძინოთ?");
        return;
      }

      // Retrieve the active question
      const getActiveQuestionQuery = `SELECT question_${language}, active, id,right_answer_${language} FROM questions WHERE active = ?`;
      const activeQuestions = await queryDatabase(getActiveQuestionQuery, [1]);

      // Retrieve the seen questions for the user
      const getUserInfoQuery = `SELECT seenquestions, x1_25_point, x1_5_point, x2_point FROM users WHERE id = ?`;
      const [userInfoResult] = await queryDatabase(getUserInfoQuery, [user_id]);

      const userSeenQuestions = userInfoResult.seenquestions
        ? userInfoResult.seenquestions.split(",")
        : [];

      const filteredQuestions = activeQuestions.filter(
        (question) => !userSeenQuestions.includes(question.id.toString())
      );

      if (filteredQuestions.length === 0) {
        res.status(403).send(language=="EN"?"You have seen all the questions.":"თქვენ უკვე ნახეთ ყველა კითხვა");
        return;
      }

      const randomQuestion =
        filteredQuestions[Math.floor(Math.random() * filteredQuestions.length)];

      // Update the seen questions for the user
      const updateUserSeenQuestionsQuery = `UPDATE users SET seenquestions = ? WHERE id = ?`;
      const updatedSeenQuestions = userSeenQuestions.concat(randomQuestion.id);
      await queryDatabase(updateUserSeenQuestionsQuery, [
        updatedSeenQuestions.join(","),
        user_id,
      ]);

      let answers = [];
      if (usingHelp == 1) {
        const rightAnswer =
          randomQuestion.right_answer_GE || randomQuestion.right_answer_EN;
        answers.push(rightAnswer);
        const getHelpfulAnswersQuery = `SELECT answer_1_${language}, answer_2_${language}, answer_3_${language}, answer_4_${language} FROM answers WHERE question_id = ?`;
        const userUpdateQuery = `UPDATE users SET help = help - 1 WHERE id = ?`;
        const answersForAnswers = await queryDatabase(getHelpfulAnswersQuery, [
          randomQuestion.id,
        ]);

        function removeFour(arr) {
          return arr.map((obj) => {
            let newObj = {};
            for (let key in obj) {
              if (obj[key] !== rightAnswer) {
                newObj[key] = obj[key];
              }
            }
            return newObj;
          });
        }
        const updatedAnswers = removeFour(answersForAnswers);
        function getRandomValue(arr) {
          if (arr.length === 0) return null;

          const obj = arr[0];
          const values = Object.values(obj);
          const randomIndex = Math.floor(Math.random() * values.length);
          return values[randomIndex];
        }
        const randomValue = getRandomValue(updatedAnswers);

        await queryDatabase(userUpdateQuery, [user_id]);

        answers.push(randomValue);
      } else {
        const getAnswersQuery = `SELECT answer_1_${language}, answer_2_${language}, answer_3_${language}, answer_4_${language} FROM answers WHERE question_id = ?`;
        answers = await queryDatabase(getAnswersQuery, [randomQuestion.id]);

        // Extract answers from objects to an array of strings
        answers = answers[0] ? Object.values(answers[0]) : [];
      }

      // Shuffle the answers array
      answers = shuffleArray(answers);

      // Prepare avaialbe_x_points array
      const availablePoints = [];
      if (userInfoResult.x1_25_point > 0) availablePoints.push("x1_25_point");
      if (userInfoResult.x1_5_point > 0) availablePoints.push("x1_5_point");
      if (userInfoResult.x2_point > 0) availablePoints.push("x2_point");

      res.send({
        question:
          language == "GE"
            ? randomQuestion.question_GE
            : randomQuestion.question_EN,
        question_id: randomQuestion.id,
        answers: answers,
        avaialbe_x_points: availablePoints,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.status(401).send(language=="EN"?"The game is paused and will resume soon":"თამაში გაჩერებულია და მალე დაიწყება");
  }
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

questionsRouter.post("/answer", async (req, res) => {
  const { question_id, answer, time, user_id, use_x, language } = req.body;
  const questionQuery = `SELECT right_answer_${language} FROM questions WHERE id = ?`;
  const pointAddQuery = `UPDATE users SET point = point + ? WHERE id = ?`;
  const incorrectAnswerQuery = `UPDATE users SET health = health-1 WHERE id = ?`;
  const question = await queryDatabase(questionQuery, [question_id]);
  let pointToAdd;
  if (use_x == 0) {
    pointToAdd = time;
  } else {
    pointToAdd = time * use_x;
    let pointColumn;
    if (use_x == "x1_25_point") {
      pointColumn = "x1_25_point";
    } else if (use_x == "x1_5_point") {
      pointColumn = "x1_5_point";
    } else if (use_x == "x2_point") {
      pointColumn = "x2_point";
    }
    const subtractPointQuery = `UPDATE users SET ${pointColumn} = ${pointColumn} - 1 WHERE id = ?`;
    await queryDatabase(subtractPointQuery, [user_id]);
  }

  const correctAnswer = question[0][`right_answer_${language}`];

  if (correctAnswer === answer) {
    res.send(language == "EN" ? "Your answer is correct" : "პასუხი სწორია");
    await queryDatabase(pointAddQuery, [pointToAdd, user_id]);
  } else {
    await queryDatabase(incorrectAnswerQuery, [user_id]);
    res.send(
      language == "EN" ? "Your answer is not correct" : "პასუხი არასწორია"
    );
  }
});


questionsRouter.get("/history", async (req, res) => {
  const gameIsStartedQuery = `SELECT started_game FROM admin`;
  const [gameStatus] = await queryDatabase(gameIsStartedQuery);
  if (gameStatus.started_game == 0) {
    const { user_id, language } = req.body;
    try {
      // Get the list of seen question IDs for the user from the database
      const getUserQuery = `SELECT seenquestions FROM users WHERE id = ?`;
      const userResult = await queryDatabase(getUserQuery, [user_id]);
      const seenQuestionsString = userResult[0]?.seenquestions || ""; // Get the seen questions string or an empty string if null

      // Split the string into an array of question IDs
      const seenQuestionIds = seenQuestionsString.split(",");

      // Construct the query to select questions that the user has seen
      const getQuestionsQuery = `SELECT * FROM questions WHERE id IN (?) AND active = ?`;

      // Pass the array of question IDs and the active flag (assuming 0 means inactive) as parameters
      const questionsResult = await queryDatabase(getQuestionsQuery, [
        seenQuestionIds,
        0,
      ]);
      // Retrieve answers for seen questions
      const answers = await getAnswersForQuestions(seenQuestionIds, language);
      // Combine questions with their answers
      const questionsWithAnswers = combineQuestionsWithAnswers(
        questionsResult,
        answers,
        language
      );
      res.send(questionsWithAnswers);
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.send("You will be able to view the history while the game is closed");
  }
});

// Function to retrieve answers for given question IDs
async function getAnswersForQuestions(questionIds, language) {
  const languageSuffix = language === "GE" ? "_GE" : "_EN";
  const getAnswersQuery = `SELECT * FROM answers WHERE question_id IN (?)`;
  const answersResult = await queryDatabase(getAnswersQuery, [questionIds]);

  // Filter and map the language-specific answer columns
  const languageSpecificAnswers = answersResult.map((answer) => {
    const languageSpecificAnswer = {};
    languageSpecificAnswer.question_id = answer.question_id;
    for (const key in answer) {
      if (key.endsWith(languageSuffix)) {
        languageSpecificAnswer[key] = answer[key];
      }
    }

    return languageSpecificAnswer;
  });
  return languageSpecificAnswers;
}

function combineQuestionsWithAnswers(questions, answers, language) {
  const languageSuffix = language === "GE" ? "_GE" : "_EN";
  const questionsWithAnswers = questions.map((question) => {
    const questionAnswers = answers
      .filter((answer) => answer.question_id === question.id)
      .map((answer) => {
        const languageSpecificAnswer = {};
        for (let i = 1; i <= 4; i++) {
          const answerKey = `answer_${i}${languageSuffix}`;
          languageSpecificAnswer[`answer_${i}`] = answer[answerKey];
        }
        return languageSpecificAnswer;
      });

    // Construct a language-specific question object
    const languageSpecificQuestion = {};
    for (const key in question) {
      if (key.endsWith(languageSuffix) || key === "id") {
        languageSpecificQuestion[key] = question[key];
      }
    }

    // Combine the language-specific question with its answers
    return { ...languageSpecificQuestion, answers: questionAnswers };
  });

  return questionsWithAnswers;
}

export default questionsRouter;
