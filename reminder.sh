#!/bin/bash
curl --location --request POST 'https://fredagslaten.tk/email' \
--header 'Content-Type: application/json' \
--data-raw '{"email": "Edmolander97@gmail.com, Jcarlsson1996@gmail.com, adrianknuutinen@gmail.com, aronsson.o@gmail.com, linusri@kth.se, Lukas.elfving@gmail.com, frej.back@gmail.com, j.jagestedt@gmail.com", "message": "Hej,<br>Gå in och rösta på: https://www.fredagslaten.tk/", "subject": "Glöm inte att rösta på veckans låt!"}'
