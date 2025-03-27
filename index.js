import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import cron from "node-cron";
import bodyParser from "body-parser";
import compression from "compression";

dotenv.config();

const PORT = process.env.PORT || 8000;
const app = express();

app.use(express.json());
app.use(cors());
app.use(compression());
app.use(bodyParser.json({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.log(err));

// Expense Schema
const ExpenseSchema = new mongoose.Schema({
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    date: { type: String, required: true }, // Ensure date is stored as a string for consistency
    paymentMethod: { type: String, required: true }, // Added payment method field
    userEmail: String
});
const Expense = mongoose.model("Expense", ExpenseSchema);

// User Schema
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true },
    expenseLimit: { type: Number, default: 0 }
});
const User = mongoose.model("User", UserSchema);

// Email transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// // 🕒 CRON JOB (Runs every day at 8 PM IST)
// cron.schedule("1 * * * * *", async () => {
//     console.log("Checking expenses...");
//     const users = await User.find();
//     for (let user of users) {
//         const totalExpense = await Expense.aggregate([
//             { $match: { userEmail: user.email } },
//             { $group: { _id: null, total: { $sum: "$amount" } } }
//         ]);

//         const total = totalExpense[0]?.total || 0;
//         let message = total > user.expenseLimit
//             ? `⚠️ Warning: You exceeded ₹${user.expenseLimit}. Your current total is ₹${total}.`
//             : `✅ Good Job: You're within your ₹${user.expenseLimit} limit. Total: ₹${total}.`;

//         await transporter.sendMail({
//             from: process.env.EMAIL_USER,
//             to: user.email,
//             subject: "Daily Expense Report",
//             text: message,
//         });

//         console.log(`Email sent to ${user.email}`);
//     }
// });

// 📌 ROUTES

app.post("/expenses", async (req, res) => {
    try {
        const { amount, description, category, date, paymentMethod, userEmail } = req.body;
        if (!amount || !description || !category || !date || !paymentMethod) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const expense = new Expense({ amount, description, category, date, paymentMethod });
        await expense.save();

        await sendExpenseReport();

        res.status(201).json(expense);
    } catch (error) {
        res.status(500).json({ message: "Error adding expense", error });
    }
});


const sendExpenseReport = async () => {
    try {
        const users = await User.find();
        for (let user of users) {
            const total = await Expense.find().then(expenses => 
                expenses.reduce((sum, expense) => sum + expense.amount, 0)
            );

            console.log(`Total Expense: ₹${total}`);

            let message = total > user.expenseLimit
                ? `⚠️ Warning: You exceeded ₹${user.expenseLimit}. Your current total is ₹${total}.`
                : `✅ Good Job: You're within your ₹${user.expenseLimit} limit. Total: ₹${total}.`;

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: "Expense Update",
                text: message,
            });

            console.log(`Email sent to ${user.email}`);
        }
    } catch (error) {
        console.error("Error sending expense report:", error);
    }
};


// ➤ Get all expenses
app.get("/expenses", async (req, res) => {
    try {
        const expenses = await Expense.find();
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ message: "Error fetching expenses", error });
    }
});

// ➤ Update an expense
app.put("/expenses/:id", async (req, res) => {
    try {
        const { amount, description, category, date, paymentMethod } = req.body;
        if (!amount || !description || !category || !date || !paymentMethod) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const expense = await Expense.findByIdAndUpdate(
            req.params.id,
            { amount, description, category, date, paymentMethod },
            { new: true }
        );

        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        res.json(expense);
    } catch (error) {
        res.status(500).json({ message: "Error updating expense", error });
    }
});

// ➤ Delete an expense
app.delete("/expenses/:id", async (req, res) => {
    try {
        const expense = await Expense.findByIdAndDelete(req.params.id);
        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }
        res.json({ message: "Expense deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error deleting expense", error });
    }
});

// ➤ Set user expense limit
app.post("/set-expense-limit", async (req, res) => {
    try {
        const { email, expenseLimit } = req.body;
        if (!email || expenseLimit == null) {
            return res.status(400).json({ message: "Email and expense limit are required" });
        }

        await User.findOneAndUpdate({ email }, { expenseLimit }, { upsert: true });
        res.json({ message: "Expense limit set successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error setting expense limit", error });
    }
});

app.get("/set-expense-limit", async (req, res) => {
    try {
        const expenses = await User.find();
        res.json(expenses);
    } catch (error) {
        res.status(500).json({ message: "Error set expenses", error });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
