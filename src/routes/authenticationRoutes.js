import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { validate } from "../authorization/auth.js";
import multer from "multer";
import path from "path";
import nodemailer from "nodemailer";
import axios from "axios";
import { messageHTML } from "../views/email.js";
import {
  saveCode,
  deleteCode,
  checkCode,
  randomCodeGenerator,
} from "../controllers/codeSqlite.js";

// API SMS imports PROXIMO PASSO:

export const authenticationRoutes = (app) => {
  const upload = multer({ dest: "src/uploads/" });

  app.post("/send_sms", async (req, res) => {
    let token = process.env.SMS_API_TOKEN;
    let { phone } = req.body;
    const code = randomCodeGenerator();
    const apiUrl = "https://apihttp.disparopro.com.br:8433/mt";

    const reqData = {
      numero: phone,
      servico: "short",
      mensagem: `Seu código é: [ ${code} ]. Não compartilhe com terceiros.`,
      codificacao: "0",
    };

    const reqHeaders = {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.SMS_API_TOKEN}`,
    };

    //Send the SMS
    axios
      .post(apiUrl, reqData, { headers: reqHeaders })
      .then((response) => {
        console.log(response.data);
      })
      .catch((error) => {
        console.log(error);
      });
  });

  app.post("/confirm_code", async (req, res) => {
    let { phone, code, timestamp } = req.body;
    //Check if the user is registered, and then make the login.

    //Create the code to confirm the validation of the SMS code(?).

    //If the code is ok we proceed to auto login
    let myuser = User.findOne({ phone: phone });
    myuser = myuser.toJSON();
    delete myuser.password;
    let token = jwt.sign(myuser, process.env.SECRET_TOKEN, {
      expiresIn: "2h",
    });
    //Sending the user and the token.
    res.setHeader("auth-token", JSON.stringify(token));
    res.status(201).send(myuser);
  });

  app.get("/test_session", validate, async (req, res) => {
    res.status(200).send({ message: "Session dint expire" });
  });

  // Email verification routes

  app.post("/code_email", (req, res) => {
    // Route responsible for receiving the customer's email and sending a code by email
    const code = randomCodeGenerator();

    saveCode(req.body.email, code); // Function that saves the email and code in the database
    deleteCode(req.body.email, code); // Function that deletes the email and code stored by the above function from the database after 30 seconds
    const transport = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD_EMAIL,
      },
    });

    const emailConfig = {
      from: process.env.EMAIL,
      to: req.body.email,
      subject: "Código de verificação",
      html: messageHTML(code),
      text: `Código de verificação: ${code}`,
    };

    transport
      .sendMail(emailConfig)
      .then((response) =>
        res.status(200).send({
          message: "We sent a confirmation code to your email!",
        })
      )
      .catch((error) =>
        res.status(400).send({ message: "Enter an existing email!" })
      );
  });

  app.post("/check_code", async (req, res) => {
    // Route responsible for receiving the code and email from the customer to check if the code is correct or expired
    try {
      let check = await checkCode(req.body.email, req.body.code);
      if (!check) {
        return res.status(400).send({ message: "Invalid or expired code!" });
      }
      let exist_email = await User.findOne({ email: req.body.email });
      if (!exist_email) {
        return res
          .status(202)
          .send({ message: "Continue with customer registration" });
      }
      //Completar o cadastro
      if (exist_email.complete_register === false) {
        let myuser = exist_email.toJSON();
        delete myuser.password;
        delete myuser.__v;
        //Sending the user and the token.
        return res.status(403).send(myuser);
      }

      //Doing the automatic login.
      let myuser = exist_email.toJSON();
      delete myuser.password;
      delete myuser.__v;
      let token = jwt.sign(myuser, process.env.SECRET_TOKEN, {
        expiresIn: "2h",
      });

      //Sending the user and the token.
      res.setHeader("auth-token", JSON.stringify(token));
      res.status(200).send(myuser);
    } catch (error) {
      res.status(500).send(error);
    }
  });
  app.post("/register_part1", async (req, res) => {
    let { email, phone, name, lastName, birth_date, gender } = req.body;
    let user = {
      email,
      phone,
      name,
      lastName,
      birth_date,
      gender,
    };
    try {
      let myuser = await User.create(user);
      res.status(200).send({ id: myuser._id });
    } catch (error) {
      res.status(500).send({ message: "Cant access the database" });
    }
  });

  app.patch("/register_part2/:id", upload.single("image"), async (req, res) => {
    //Put the photo in he server
    try {
      const imagen = req.file;
      const nombreArchivo = imagen.filename;
      const urlArchivo = `http://localhost:3000/uploads/${nombreArchivo}`;
      //Update the User
      let myuser = await User.findByIdAndUpdate(
        req.params.id,
        { photos: [urlArchivo] },
        {
          new: true,
        }
      );
      //Doing the automatic login.
      myuser = myuser.toJSON();
      delete myuser.password;
      delete myuser.__v;
      let token = jwt.sign(myuser, process.env.SECRET_TOKEN, {
        expiresIn: "2h",
      });

      //Sending the user and the token.
      res.setHeader("auth-token", JSON.stringify(token));
      res.status(201).send(myuser);
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "Cant access the database" });
    }
  });
};
