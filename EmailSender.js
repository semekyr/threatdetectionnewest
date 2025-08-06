const nodemailer = require("nodemailer")
require('dotenv').config({ path: './.env' });

class EmailSender{
    constructor(service='gmail'){
        this.user = process.env.EMAIL_USER;
        this.transporter = nodemailer.createTransport({
            service: service,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS, 
            }
        })
    }


    setMailOptions(to, subject){
        this.mailOptions = {
            from: this.user,
            to: to,
            subject: subject,
            html: '',
        }
    }

    setMailBody(html){
        this.mailOptions.html = html;
    }

    send(){
        this.transporter.sendMail(this.mailOptions, function(err, info) {
            if(err)
                console.log(err);
            else
                console.log(info);
        })
    }
}

module.exports = EmailSender;