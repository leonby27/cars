UPDATE vehicles SET drivetrain='Полный'
  WHERE drivetrain IS NOT NULL AND drivetrain NOT IN ('Передний','Задний','Полный','Не указан')
    AND drivetrain ~* '(四驱|全驱|全轮|AWD|4WD|4x4|all[ -]?wheel|(dual|twin|double|two|three|triple|tri|four|quad)[ -]*motors?)';
UPDATE vehicles SET drivetrain='Задний'
  WHERE drivetrain IS NOT NULL AND drivetrain NOT IN ('Передний','Задний','Полный','Не указан')
    AND drivetrain ~* '(后驱|后置|RWD|rear[ -]?wheel)';
UPDATE vehicles SET drivetrain='Передний'
  WHERE drivetrain IS NOT NULL AND drivetrain NOT IN ('Передний','Задний','Полный','Не указан')
    AND drivetrain ~* '(前驱|前置|FWD|front[ -]?wheel)';
UPDATE vehicles SET drivetrain='Не указан'
  WHERE drivetrain IS NOT NULL AND drivetrain NOT IN ('Передний','Задний','Полный','Не указан');
