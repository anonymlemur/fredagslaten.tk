#!/bin/bash
curl --location --request POST 'https://fredagslaten.tk/email' \
--header 'Content-Type: application/json' \
--data-raw '{"email": "linusri@kth.se, Lukas.elfving@gmail.com, frej.back@gmail.com, j.jagestedt@gmail.com", "message": "Hej,<br>Gå in och rösta på: https://www.fredagslaten.tk/", "subject": "Glömm inte att rösta på veckans låt!"}'